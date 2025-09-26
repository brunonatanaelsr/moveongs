import { AppError } from '../../shared/errors';

export class InvalidMimeTypeError extends AppError {
  constructor(message = 'Invalid attachment MIME type') {
    super(message, 400);
  }
}

export class InvalidAttachmentError extends AppError {
  constructor(message = 'Invalid attachment') {
    super(message, 422);
  }
}

export class AttachmentNotFoundError extends AppError {
  constructor(message = 'Attachment not found') {
    super(message, 404);
  }
}
