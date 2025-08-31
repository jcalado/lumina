const express = require('express');
const Queue = require('bull');
const { Queue: QueueMQ } = require('bullmq');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

// Redis connection configuration
const getRedisConnection = () => {
  const url = process.env.REDIS_URL || 'redis://redis:6379';
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
  };
};

const queues = [
  new BullMQAdapter(new QueueMQ('uploads', { connection: getRedisConnection() })),
  new BullMQAdapter(new QueueMQ('thumbnails', { connection: getRedisConnection() })),
  new BullMQAdapter(new QueueMQ('blurhash', { connection: getRedisConnection() })),
  new BullMQAdapter(new QueueMQ('exif', { connection: getRedisConnection() })),
  new BullMQAdapter(new QueueMQ('sync', { connection: getRedisConnection() }))
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
  console.log('Bull Dashboard running on port 3001...');
  console.log('For the UI, open http://localhost:4568/admin/queues');
  console.log('Make sure Redis is accessible via REDIS_URL environment variable');
});