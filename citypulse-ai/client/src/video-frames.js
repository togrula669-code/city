/** Extract genuine browser-decoded JPEG keyframes from an uploaded short video.
 * We intentionally do NOT infer anything about the soundtrack. */
export async function sampleVideoFrames(file,{count=3,maxSeconds=30}={}){
  if(!file?.type?.startsWith('video/'))throw new Error('Choose a video file first.');
  const url=URL.createObjectURL(file);
  const video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;video.src=url;
  const wait=(event,ms=12000)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error(`Video decoding timed out waiting for ${event}.`));},ms);
    const success=()=>{cleanup();resolve();};const failed=()=>{cleanup();reject(new Error('This video cannot be decoded by your browser. Try a different MP4 or WebM.'));};
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener(event,success);video.removeEventListener('error',failed);};
    video.addEventListener(event,success,{once:true});video.addEventListener('error',failed,{once:true});
  });
  try{
    const metadata=wait('loadedmetadata');video.load();await metadata;
    if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>maxSeconds)throw new Error(`Video must be at most ${maxSeconds} seconds long.`);
    if(!video.videoWidth||!video.videoHeight)throw new Error('Unable to read video frames.');
    const scale=Math.min(1,640/video.videoWidth,640/video.videoHeight);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(video.videoWidth*scale));canvas.height=Math.max(1,Math.floor(video.videoHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas rendering unavailable in this browser.');
    const frames=[];
    for(let i=0;i<count;i++){
      const t=Math.max(0,Math.min(video.duration-0.02,video.duration*(0.15+0.7*i/Math.max(1,count-1))));
      const seeked=wait('seeked');video.currentTime=t;await seeked;
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const jpeg=canvas.toDataURL('image/jpeg',0.68).split(',')[1];
      if(!jpeg||jpeg.length>2_000_000)throw new Error('The video produced an oversized frame.');
      frames.push(jpeg);
    }
    return frames;
  }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
