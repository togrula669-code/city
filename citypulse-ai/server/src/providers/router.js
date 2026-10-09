import { createGeminiProvider } from './gemini.js';
import { createGroqProvider } from './groq.js';
import { AppError } from '../utils/errors.js';

/** Route modalities explicitly; never silently switch on paid quotas or authorization failures. */
export function createAIProvider(config, overrides = {}) {
  const gemini = overrides.gemini || createGeminiProvider({apiKey:config.geminiApiKey,model:config.geminiModel});
  const groq = overrides.groq || createGroqProvider({apiKey:config.groqApiKey,model:config.groqModel,visionModel:config.groqVisionModel,audioModel:config.groqAudioModel});
  const mode = String(config.aiProvider || 'auto').toLowerCase();
  if (!['auto','groq','gemini'].includes(mode)) throw new Error('AI_PROVIDER must be auto, groq, or gemini.');
  const selected = mode === 'gemini' ? gemini : mode === 'groq' ? groq : (groq.configured ? groq : gemini);
  const videoFallback = config.groqVideoFallback === 'gemini' && gemini.configured && selected.name === 'groq';
  const wrap = async (provider, cb) => {
    const result = await cb();
    if (result && typeof result === 'object' && result.analysis) return result;
    return {analysis:result,provider:provider.name,model:provider.model};
  };
  return {
    name:selected.name, model:selected.model, configured:selected.configured,
    supports:{...selected.supports, video: selected.name === 'groq' ? videoFallback : selected.supports.video, video_frames:Boolean(selected.analyzeFrames)},
    models:selected.models || {text:selected.model,image:selected.model,audio:selected.model,video:selected.model},
    videoFallback:videoFallback ? 'gemini' : 'browser-keyframes',
    analyzeFrames:(frames,description='')=>wrap(selected,()=>selected.analyzeFrames(frames,description)),
    analyzeText:(description)=>wrap(selected,()=>selected.analyzeText(description)),
    analyzeMedia:(bytes,mime,description='')=>{
      if (mime.startsWith('video/') && selected.name === 'groq') {
        if (!videoFallback) throw new AppError('AI_UNSUPPORTED_MODALITY','Groq does not support direct video analysis here. Set GEMINI_API_KEY, GEMINI_MODEL and GROQ_VIDEO_FALLBACK=gemini, or submit a photo/audio report.',422);
        return wrap(gemini,()=>gemini.analyzeMedia(bytes,mime,description));
      }
      return wrap(selected,()=>selected.analyzeMedia(bytes,mime,description));
    }
  };
}
