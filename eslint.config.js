import stylistic from '@stylistic/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['node_modules/**', 'public/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      curly: ['error', 'multi'],
      '@stylistic/nonblock-statement-body-position': ['error', 'beside'],
      'no-void': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[returnType.typeAnnotation.type='TSVoidKeyword']",
          message:
            'Omit explicit : void return types; TypeScript infers void from the function body.',
        },
        {
          selector:
            "MethodDefinition > :matches(FunctionExpression, ArrowFunctionExpression)[returnType.typeAnnotation.type='TSVoidKeyword']",
          message:
            'Omit explicit : void return types; TypeScript infers void from the function body.',
        },
      ],
      '@stylistic/lines-around-comment': [
        'error',
        {
          beforeBlockComment: false,
          afterBlockComment: false,
          allowBlockStart: true,
          allowClassStart: true,
          allowObjectStart: true,
          allowArrayStart: true,
          allowInterfaceStart: true,
          allowTypeStart: true,
          allowEnumStart: true,
          allowModuleStart: true,
        },
      ],
    },
  },
  {
    files: ['**/*.mjs'],
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      curly: ['error', 'multi'],
      '@stylistic/nonblock-statement-body-position': ['error', 'beside'],
      'no-void': 'error',
    },
  },
];
