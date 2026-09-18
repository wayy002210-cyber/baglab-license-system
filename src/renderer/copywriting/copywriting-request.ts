export type CopywritingPersona = {
  id: string;
  name: string;
  industry: string;
  brandFacts: string[];
  tone: string;
  cta: string;
};

export type CopywritingContext = {
  model: string;
  personaId: string;
  personaName: string;
  industry: string;
  brandFacts: string[];
  tone: string;
  cta: string;
};

export function toCopywritingContext(
  persona: CopywritingPersona,
  model: string
): CopywritingContext {
  return {
    model,
    personaId: persona.id,
    personaName: persona.name,
    industry: persona.industry,
    brandFacts: [...persona.brandFacts],
    tone: persona.tone,
    cta: persona.cta
  };
}

export function toCopywritingGenerationInput(
  context: CopywritingContext,
  bannedWords: string[]
): CopywritingContext & { bannedWords: string[] } {
  return {
    ...context,
    brandFacts: [...context.brandFacts],
    bannedWords: [...bannedWords]
  };
}
