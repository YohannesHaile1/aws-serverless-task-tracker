import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../shared/task';
import { createHandler } from '../src/app';
import { InMemoryTaskRepository } from './inMemoryTaskRepository';

const ORIGIN = 'http://localhost:5173';
const NOW = '2026-10-05T12:00:00.000Z';
const ID = '11111111-2222-4333-8444-555555555555';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';

/** Builds the parts of an API Gateway proxy event that the handler reads. */
function request(
  httpMethod: string,
  resource: string,
  options: { id?: string; body?: unknown; query?: Record<string, string> } = {},
): APIGatewayProxyEvent {
  return {
    httpMethod,
    resource,
    path: options.id ? resource.replace('{id}', options.id) : resource,
    pathParameters: options.id ? { id: options.id } : null,
    queryStringParameters: options.query ?? null,
    body:
      options.body === undefined
        ? null
        : typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body),
    isBase64Encoded: false,
  } as APIGatewayProxyEvent;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: ID,
    title: 'Existing task',
    description: '',
    status: 'TODO',
    dueDate: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

let repository: InMemoryTaskRepository;
let handler: ReturnType<typeof createHandler>;

beforeEach(() => {
  repository = new InMemoryTaskRepository();
  handler = createHandler({
    repository,
    allowedOrigin: ORIGIN,
    now: () => new Date(NOW),
    generateId: () => ID,
  });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /tasks', () => {
  it('returns all tasks, newest first', async () => {
    await repository.create(makeTask({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }));
    await repository.create(makeTask({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' }));

    const response = await handler(request('GET', '/tasks'));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).map((t: Task) => t.id)).toEqual(['b', 'a']);
  });

  it('filters by status', async () => {
    await repository.create(makeTask({ id: 'a', status: 'TODO' }));
    await repository.create(makeTask({ id: 'b', status: 'COMPLETED' }));

    const response = await handler(request('GET', '/tasks', { query: { status: 'COMPLETED' } }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).map((t: Task) => t.id)).toEqual(['b']);
  });

  it('returns an empty array when there are no tasks', async () => {
    const response = await handler(request('GET', '/tasks'));
    expect(JSON.parse(response.body)).toEqual([]);
  });

  it('rejects an unknown status filter with 400', async () => {
    const response = await handler(request('GET', '/tasks', { query: { status: 'DONE' } }));
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/status must be one of/);
  });
});

describe('POST /tasks', () => {
  it('creates a task with server-generated id and timestamps', async () => {
    const response = await handler(
      request('POST', '/tasks', {
        body: { title: '  Write README  ', description: 'Explain the DynamoDB design', dueDate: '2026-10-31' },
      }),
    );

    const expected: Task = {
      id: ID,
      title: 'Write README',
      description: 'Explain the DynamoDB design',
      status: 'TODO',
      dueDate: '2026-10-31',
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual(expected);
    expect(repository.tasks.get(ID)).toEqual(expected);
  });

  it('applies defaults for optional fields', async () => {
    const response = await handler(request('POST', '/tasks', { body: { title: 'Minimal' } }));
    expect(JSON.parse(response.body)).toMatchObject({ description: '', status: 'TODO', dueDate: null });
  });

  it.each([
    ['no body', undefined, /body is required/],
    ['invalid JSON', '{not json', /valid JSON/],
    ['a JSON array', [], /JSON object/],
    ['missing title', { description: 'x' }, /title is required/],
    ['blank title', { title: '   ' }, /title is required/],
    ['too-long title', { title: 'x'.repeat(201) }, /at most 200/],
    ['non-string description', { title: 'x', description: 5 }, /description must be a string/],
    ['too-long description', { title: 'x', description: 'x'.repeat(2001) }, /at most 2000/],
    ['unknown status', { title: 'x', status: 'DONE' }, /status must be one of/],
    ['badly formatted dueDate', { title: 'x', dueDate: '10/31/2026' }, /dueDate/],
    ['impossible dueDate', { title: 'x', dueDate: '2026-02-30' }, /dueDate/],
    ['server-controlled field', { title: 'x', id: 'abc' }, /Unknown field: id/],
  ])('rejects %s with 400', async (_case, body, message) => {
    const response = await handler(request('POST', '/tasks', { body }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(message);
    expect(repository.tasks.size).toBe(0);
  });
});

describe('GET /tasks/{id}', () => {
  it('returns the task', async () => {
    await repository.create(makeTask());
    const response = await handler(request('GET', '/tasks/{id}', { id: ID }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(makeTask());
  });

  it('returns 404 when the task does not exist', async () => {
    const response = await handler(request('GET', '/tasks/{id}', { id: MISSING_ID }));
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ message: 'Task not found' });
  });

  it('returns 400 for an id that is not a UUID', async () => {
    const response = await handler(request('GET', '/tasks/{id}', { id: 'not-a-uuid' }));
    expect(response.statusCode).toBe(400);
  });
});

describe('PUT /tasks/{id}', () => {
  it('replaces the editable fields, keeps createdAt and bumps updatedAt', async () => {
    await repository.create(makeTask());

    const response = await handler(
      request('PUT', '/tasks/{id}', {
        id: ID,
        body: { title: 'Renamed', description: 'Now with details', status: 'IN_PROGRESS', dueDate: '2026-11-01' },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ...makeTask(),
      title: 'Renamed',
      description: 'Now with details',
      status: 'IN_PROGRESS',
      dueDate: '2026-11-01',
      updatedAt: NOW,
    });
  });

  it('returns 404 when the task does not exist', async () => {
    const response = await handler(request('PUT', '/tasks/{id}', { id: MISSING_ID, body: { title: 'x' } }));
    expect(response.statusCode).toBe(404);
  });

  it('validates the body before touching storage', async () => {
    await repository.create(makeTask());
    const response = await handler(request('PUT', '/tasks/{id}', { id: ID, body: { title: '' } }));
    expect(response.statusCode).toBe(400);
    expect(repository.tasks.get(ID)).toEqual(makeTask());
  });

  it('returns 400 for an id that is not a UUID', async () => {
    const response = await handler(request('PUT', '/tasks/{id}', { id: 'nope', body: { title: 'x' } }));
    expect(response.statusCode).toBe(400);
  });
});

describe('DELETE /tasks/{id}', () => {
  it('deletes the task and returns 204 with an empty body', async () => {
    await repository.create(makeTask());
    const response = await handler(request('DELETE', '/tasks/{id}', { id: ID }));
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(repository.tasks.size).toBe(0);
  });

  it('returns 404 when the task does not exist', async () => {
    const response = await handler(request('DELETE', '/tasks/{id}', { id: MISSING_ID }));
    expect(response.statusCode).toBe(404);
  });
});

describe('HTTP behaviour', () => {
  it('returns 404 for an unknown route', async () => {
    const response = await handler(request('PATCH', '/tasks'));
    expect(response.statusCode).toBe(404);
  });

  it('adds JSON and CORS headers to every response', async () => {
    const ok = await handler(request('GET', '/tasks'));
    const bad = await handler(request('GET', '/tasks', { query: { status: 'nope' } }));
    for (const response of [ok, bad]) {
      expect(response.headers).toMatchObject({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ORIGIN,
      });
    }
  });

  it('decodes base64-encoded bodies', async () => {
    const event = request('POST', '/tasks');
    event.body = Buffer.from(JSON.stringify({ title: 'Encoded' })).toString('base64');
    event.isBase64Encoded = true;

    const response = await handler(event);

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).title).toBe('Encoded');
  });

  it('returns a generic 500 without leaking error details, and logs the error', async () => {
    vi.spyOn(repository, 'list').mockRejectedValue(new Error('DynamoDB exploded: arn:aws:dynamodb:secret'));

    const response = await handler(request('GET', '/tasks'));

    expect(response.statusCode).toBe(500);
    expect(response.body).toBe(JSON.stringify({ message: 'Internal server error' }));
    expect(console.error).toHaveBeenCalled();
  });
});
