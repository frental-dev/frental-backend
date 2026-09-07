const multer = require('multer');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const MAX_IMAGE_SIZE = 15 * 1024 * 1024;   // 15 MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;  // 200 MB

// Memory storage: we stream straight to MinIO/Cloudinary, never touch local disk.
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);

  if (!isImage && !isVideo) {
    return cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_VIDEO_SIZE, // ceiling; per-type check happens in the service layer
    files: 10,                // max files per upload batch
  },
});

// Post-multer guard: enforce per-type size limits since multer only supports one global limit.
function enforcePerTypeLimits(req, res, next) {
  const files = req.files || [];
  for (const file of files) {
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const limit = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > limit) {
      return res.status(413).json({
        error: `${file.originalname} exceeds max size of ${limit / (1024 * 1024)}MB`,
      });
    }
  }
  next();
}

module.exports = { upload, enforcePerTypeLimits, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES };
