import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { Task } from '../../shared/task';
import type { TaskRepository } from './taskRepository';
import { isValidTaskId, parseStatusFilter, parseTaskInput } from './validation';

export interface AppDependencies {
  repository: TaskRepository;
  /** The single browser origin allowed to call the API (CORS). */
  allowedOrigin: string;
  /** Injectable so tests get predictable timestamps and ids. */
  now?: () => Date;
  generateId?: () => string;
}

type Handler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

/**
 * Builds the Lambda handler. This layer only deals with HTTP: routing,
 * input validation, status codes and response formatting. Storage is
 * delegated to the TaskRepository.
 */
export function createHandler({
  repository,
  allowedOrigin,
  now = () => new Date(),
  generateId = randomUUID,
}: AppDependencies): Handler {
  function respond(statusCode: number, body?: unknown): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        // With Lambda proxy integration, API Gateway passes this response through
        // unchanged, so the Lambda must add the CORS header itself.
        'Access-Control-Allow-Origin': allowedOrigin,
      },
      body: body === undefined ? '' : JSON.stringify(body),
    };
  }

  const error = (statusCode: number, message: string) => respond(statusCode, { message });

  async function route(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const id = event.pathParameters?.id;

    // event.resource is the route template from API Gateway, e.g. "/tasks/{id}".
    switch (`${event.httpMethod} ${event.resource}`) {
      case 'GET /tasks': {
        const filter = parseStatusFilter(event.queryStringParameters?.status);
        if (!filter.ok) return error(400, filter.message);
        return respond(200, await repository.list(filter.value));
      }

      case 'POST /tasks': {
        const input = parseTaskInput(readBody(event));
        if (!input.ok) return error(400, input.message);
        const timestamp = now().toISOString();
        const task: Task = { id: generateId(), ...input.value, createdAt: timestamp, updatedAt: timestamp };
        await repository.create(task);
        return respond(201, task);
      }

      case 'GET /tasks/{id}': {
        if (!isValidTaskId(id)) return error(400, 'Invalid task id');
        const task = await repository.get(id);
        return task ? respond(200, task) : error(404, 'Task not found');
      }

      case 'PUT /tasks/{id}': {
        if (!isValidTaskId(id)) return error(400, 'Invalid task id');
        const input = parseTaskInput(readBody(event));
        if (!input.ok) return error(400, input.message);
        const task = await repository.update(id, input.value, now().toISOString());
        return task ? respond(200, task) : error(404, 'Task not found');
      }

      case 'DELETE /tasks/{id}': {
        if (!isValidTaskId(id)) return error(400, 'Invalid task id');
        const deleted = await repository.delete(id);
        return deleted ? respond(204) : error(404, 'Task not found');
      }

      default:
        return error(404, 'Route not found');
    }
  }

  return async function handler(event) {
    let response: APIGatewayProxyResult;
    try {
      response = await route(event);
    } catch (err) {
      // Full details go to CloudWatch Logs; the client only sees a generic message.
      console.error('Unhandled error', err);
      response = error(500, 'Internal server error');
    }
    console.info(`${event.httpMethod} ${event.path} -> ${response.statusCode}`);
    return response;
  };
}

function readBody(event: APIGatewayProxyEvent): string | null {
  if (event.body && event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body;
}
