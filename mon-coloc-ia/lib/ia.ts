import { google } from '@ai-sdk/google';

// Modèle Gemini partagé par toutes les routes IA.
// « gemini-flash-latest » est un alias officiel qui pointe toujours vers le
// dernier modèle Flash disponible — il survit aux retraits de modèles côté
// Google. Surchargable via la variable d'environnement GEMINI_MODEL sans
// toucher au code.
export function modeleGemini() {
  return google(process.env.GEMINI_MODEL || 'gemini-flash-latest');
}
