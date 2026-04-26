const ChatThread = require('../models/ChatThread');

async function repairChatThreadIndexes() {
  try {
    await ChatThread.updateMany(
      { type: 'direct', course: null },
      { $unset: { course: 1 } }
    );

    const indexes = await ChatThread.collection.indexes();
    const legacyIndex = indexes.find((item) => item.name === 'type_1_course_1');

    if (legacyIndex) {
      await ChatThread.collection.dropIndex(legacyIndex.name);
    }

    await ChatThread.collection.createIndex(
      { type: 1, course: 1 },
      {
        name: 'chat_group_course_unique',
        unique: true,
        partialFilterExpression: {
          type: 'group',
          course: { $exists: true }
        }
      }
    );
  } catch (error) {
    console.error('[chat] index repair failed:', error.message);
  }
}

module.exports = {
  repairChatThreadIndexes
};
