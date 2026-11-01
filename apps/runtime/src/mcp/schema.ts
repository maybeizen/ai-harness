import { mcpInputSchema } from '@harness/contracts';
import type {
  jsonSchemaValidator,
  JsonSchemaType,
} from '@modelcontextprotocol/sdk/validation/types.js';
export const boundedValidator: jsonSchemaValidator = {
  getValidator<T>(schema: JsonSchemaType) {
    const validator = mcpInputSchema(schema);
    return (input: unknown) => {
      const parsed = validator?.safeParse(input);
      return parsed?.success
        ? { valid: true, data: parsed.data as T, errorMessage: undefined }
        : {
            valid: false,
            data: undefined,
            errorMessage: 'Unsupported schema or invalid MCP output.',
          };
    };
  },
};
