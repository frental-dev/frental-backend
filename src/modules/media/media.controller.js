const mediaService = require('./media.service');

async function upload(req, res, next) {
  try {
    const { propertyId } = req.params;
    const agentId = req.agent.id;
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }
    const media = await mediaService.uploadPropertyMedia({ propertyId, agentId, files });
    res.status(202).json({ message: `${media.length} file(s) accepted, processing in background`, media });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const { propertyId } = req.params;
    const media = await mediaService.listPropertyMedia(propertyId);
    res.json({ media });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const { mediaId } = req.params;
    await mediaService.deleteMedia({ mediaId, agentId: req.agent.id });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { upload, list, remove };
