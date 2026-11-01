import {
  generationControlFlags,
  type GenerationInput,
  type ModelCapabilities,
} from '@harness/contracts';
import type { PromptImage } from '@harness/providers';
import type { Repository } from '../storage/repository';
export function visionOutbound(
  repository: Repository | undefined,
  input: GenerationInput,
  capabilities?: Partial<Pick<ModelCapabilities, 'vision' | 'images'>>,
) {
  const vision = generationControlFlags(capabilities).vision;
  const outbound = repository
    ? repository.providerMessages(input, vision)
    : {
        ...input,
        messages: input.messages.filter(
          (message) => message.id !== input.generationId,
        ),
      };
  const images: Record<string, PromptImage[]> =
    vision && repository ? repository.promptImages(outbound.messages) : {};
  return { outbound, images, vision };
}
