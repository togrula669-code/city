import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AppError } from '../utils/errors.js';

/** Private disk-backed evidence archive. Not suitable for ephemeral/serverless hosting. */
export function createEvidenceArchive(dir){
  return {
    async save(incidentId,{bytes,mime}){
      if(!Buffer.isBuffer(bytes)||!mime)return null;
      const id=crypto.randomUUID();
      await fs.mkdir(dir,{recursive:true,mode:0o700});
      const file=path.join(dir,id+'.bin');
      await fs.writeFile(file,bytes,{flag:'wx',mode:0o600});
      return {id,incident_id:incidentId,mime_type:mime,size:bytes.length,created_at:new Date().toISOString()};
    },
    async read(id){
      if(!/^[a-f\d-]{36}$/.test(id))throw new AppError('NOT_FOUND','Evidence not found.',404);
      try{return await fs.readFile(path.join(dir,id+'.bin'));}
      catch(e){if(e.code==='ENOENT')throw new AppError('NOT_FOUND','Evidence not found.',404);throw e;}
    }
  };
}
