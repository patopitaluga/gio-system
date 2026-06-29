import path from 'path';
import { mkdirSync, readFileSync, unlinkSync } from 'fs';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { TurnSessionManager } from './agent/session-manager.ts';
import type { TurnMetadata } from './agent/types.ts';
import { projectRoot } from '../config/workspace.ts';
import { logTurn, logTurnError } from '../utils/turn-log.ts';

const uploadsDir = path.join(projectRoot, 'temp-uploads');
mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

const uploadImage = upload.single('image');

function imageFileToDataUrl(filePath: string, mimeType: string): string {
  const data = readFileSync(filePath);
  return `data:${mimeType};base64,${data.toString('base64')}`;
}

export function createTurnPostHandler(sessionManager: TurnSessionManager) {
  return (req: Request, res: Response) => {
    uploadImage(req, res, async () => {
      const imageFile = req.file;
      const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';

      if (!question) {
        res.status(400).send({ error: 'Provide a text question' });
        return;
      }

      const tempPaths: string[] = [];

      try {
        const metadata: TurnMetadata = { question };

        if (imageFile) {
          tempPaths.push(imageFile.path);
          metadata.imageDataUrl = imageFileToDataUrl(
            imageFile.path,
            imageFile.mimetype || 'application/octet-stream',
          );
        }

        const turnResult = await sessionManager.processTextTurn(metadata);

        logTurn('http response', {
          actionCount: turnResult.actions.length,
          responseLength: turnResult.response.length,
        });
        console.log(turnResult.response);
        res.send(turnResult);
      } catch (error) {
        logTurnError('http request failed', error);
        res.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to process request',
        });
      } finally {
        for (const filePath of tempPaths) 
          unlinkSync(filePath);
        
      }
    });
  };
}
