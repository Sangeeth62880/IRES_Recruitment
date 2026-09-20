const fs = require('fs');

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

/**
 * Derives verified image MIME type on disk from true file magic bytes.
 * Returns 'image/png', 'image/jpeg', or null if invalid.
 * 
 * @param {string} filePath - Absolute path to uploaded file on disk
 * @returns {string|null} - MIME type or null
 */
function getImageMimeType(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  let fd = null;
  try {
    const buffer = Buffer.alloc(8);
    fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 8, 0);

    if (bytesRead < 3) {
      return null;
    }

    // Check JPEG signature: FF D8 FF
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    if (isJpeg) {
      return 'image/jpeg';
    }

    // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const isPng = bytesRead >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A;

    if (isPng) {
      return 'image/png';
    }

    return null;
  } catch (err) {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (_) {}
    }
  }
}

/**
 * Validates file magic bytes on disk against allowed image signatures (PNG and JPEG).
 * 
 * @param {string} filePath - Absolute path to uploaded file on disk
 * @returns {boolean} - true if file matches PNG or JPEG magic bytes
 */
function isValidImage(filePath) {
  return getImageMimeType(filePath) !== null;
}

/**
 * Derives verified image MIME type from an in-memory Buffer's magic bytes.
 * Used with Multer memoryStorage where there is no file on disk.
 * Returns 'image/png', 'image/jpeg', or null if invalid.
 *
 * @param {Buffer} buffer - The file buffer from req.file.buffer
 * @returns {string|null} - MIME type or null
 */
function getImageMimeTypeFromBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 3) {
    return null;
  }

  // Check JPEG signature: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A) {
    return 'image/png';
  }

  return null;
}

/**
 * Validates in-memory buffer magic bytes against allowed image signatures (PNG and JPEG).
 *
 * @param {Buffer} buffer - The file buffer from req.file.buffer
 * @returns {boolean} - true if buffer matches PNG or JPEG magic bytes
 */
function isValidImageBuffer(buffer) {
  return getImageMimeTypeFromBuffer(buffer) !== null;
}

module.exports = {
  isValidImage,
  getImageMimeType,
  isValidImageBuffer,
  getImageMimeTypeFromBuffer,
  ALLOWED_IMAGE_EXTENSIONS
};
