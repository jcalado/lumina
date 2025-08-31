const express = require('express');
const Queue = require('bull');
const { Queue: QueueMQ } = require('bullmq');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const queues = [
  new BullMQAdapter(new QueueMQ('uploads')),
  new BullMQAdapter(new QueueMQ('thumbnails')),
  new BullMQAdapter(new QueueMQ('blurhash')),
  new BullMQAdapter(new QueueMQ('exif')),
  new BullMQAdapter(new QueueMQ('sync'))
];

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues,
  serverAdapter: serverAdapter,
});

const app = express();

app.use('/admin/queues', serverAdapter.getRouter());

// other configurations of your server

app.listen(3001, () => {
  console.log('Running on 3001...');
  console.log('For the UI, open http://localhost:3001/admin/queues');
  console.log('Make sure Redis is running on port 6379 by default');
});