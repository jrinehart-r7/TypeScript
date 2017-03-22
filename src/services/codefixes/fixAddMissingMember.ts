/* @internal */
namespace ts.codefix {
    registerCodeFix({
        errorCodes: [Diagnostics.Property_0_does_not_exist_on_type_1.code],
        getCodeActions: getActionsForAddMissingMember
    });

    function getActionsForAddMissingMember(context: CodeFixContext): CodeAction[] | undefined {

        const sourceFile = context.sourceFile;
        const start = context.span.start;
        // This is the identifier of the missing property. eg:
        // this.missing = 1;
        //      ^^^^^^^
        const token = getTokenAtPosition(sourceFile, start);
        if (token.kind != SyntaxKind.Identifier) {
            return undefined;
        }

        if (!isPropertyAccessExpression(token.parent) || token.parent.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }

        const classMemberDeclaration = getThisContainer(token, /*includeArrowFunctions*/ false);
        if (!isClassElement(classMemberDeclaration)) {
            return undefined;
        }

        const classDeclaration = <ClassLikeDeclaration>classMemberDeclaration.parent;
        if (!classDeclaration || !isClassLike(classDeclaration)) {
            return undefined;
        }

        const isStatic = hasModifier(classMemberDeclaration, ModifierFlags.Static);

        return isInJavaScriptFile(sourceFile) ? getActionsForAddMissingMemberInJavaScriptFile() : getActionsForAddMissingMemberInTypeScriptFile();

        function getActionsForAddMissingMemberInTypeScriptFile(): CodeAction[] | undefined {
            let typeString = "any";

            if (token.parent.parent.kind === SyntaxKind.BinaryExpression) {
                const binaryExpression = token.parent.parent as BinaryExpression;

                const checker = context.program.getTypeChecker();
                const widenedType = checker.getWidenedType(checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(binaryExpression.right)));
                typeString = checker.typeToString(widenedType);
            }

            const startPos = classDeclaration.members.pos;

            const actions = [{
                description: formatStringFromArgs(getLocaleSpecificMessage(Diagnostics.Add_declaration_for_missing_property_0), [token.getText()]),
                changes: [{
                    fileName: sourceFile.fileName,
                    textChanges: [{
                        span: { start: startPos, length: 0 },
                        newText: `${isStatic ? "static " : ""}${token.getText(sourceFile)}: ${typeString};`
                    }]
                }]
            }];

            if (!isStatic) {
                actions.push({
                    description: formatStringFromArgs(getLocaleSpecificMessage(Diagnostics.Add_index_signature_for_missing_property_0), [token.getText()]),
                    changes: [{
                        fileName: sourceFile.fileName,
                        textChanges: [{
                            span: { start: startPos, length: 0 },
                            newText: `[x: string]: ${typeString};`
                        }]
                    }]
                });
            }

            return actions;
        }

        function getActionsForAddMissingMemberInJavaScriptFile(): CodeAction[] | undefined {
            const memberName = token.getText();

            if (isStatic) {
                if (classDeclaration.kind === SyntaxKind.ClassExpression) {
                    return undefined;
                }

                const className = classDeclaration.name.getText();

                return [{
                    description: formatStringFromArgs(getLocaleSpecificMessage(Diagnostics.Initialize_static_property_0), [memberName]),
                    changes: [{
                        fileName: sourceFile.fileName,
                        textChanges: [{
                            span: { start: classDeclaration.getEnd(), length: 0 },
                            newText: `${context.newLineCharacter}${className}.${memberName} = undefined;${context.newLineCharacter}`
                        }]
                    }]
                }];
            }
            else {
                const classConstructor = getFirstConstructorWithBody(classDeclaration);
                if (!classConstructor) {
                    return undefined;
                }

                return [{
                    description: formatStringFromArgs(getLocaleSpecificMessage(Diagnostics.Initialize_property_0_in_the_constructor), [memberName]),
                    changes: [{
                        fileName: sourceFile.fileName,
                        textChanges: [{
                            span: { start: classConstructor.body.getEnd() - 1, length: 0 },
                            newText: `this.${memberName} = undefined;${context.newLineCharacter}`
                        }]
                    }]
                }];
            }
        }
    }
}