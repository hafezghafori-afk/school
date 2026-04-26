function requireFields(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      const value = req.body[field];
      if (value === undefined || value === null || value === '') {
        return res.status(400).json({ message: `فیلد ${field} الزامی است` });
      }
    }
    next();
  };
}

module.exports = {
  requireFields
};
