import Fastify from 'fastify';
import { courses } from '@enzo/catalog';
import { courseStatus, durationLabel } from '@enzo/domain';

// Seed catalog only. Browser-local administrator edits are not server data.
export function buildApp({ logger = false } = {}) {
  const app = Fastify({ logger });
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/courses', async () => {
    const now = Date.now();
    return { courses: courses.map(course => ({
      ...course, status: courseStatus(course, now), duration: durationLabel(course),
    })) };
  });
  app.get<{ Params: { id: string } }>('/api/courses/:id', {
    schema: { params: {
      type: 'object', required: ['id'],
      properties: { id: { type: 'string', minLength: 1, maxLength: 100 } },
    } },
  }, async (request, reply) => {
    const course = courses.find(item => item.id === request.params.id);
    if (!course) return reply.code(404).send({ error: 'Course not found' });
    return { course: { ...course, status: courseStatus(course), duration: durationLabel(course) } };
  });
  return app;
}
