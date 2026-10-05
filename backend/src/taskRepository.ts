import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Task, TaskStatus } from '../../shared/task';
import type { ValidTaskInput } from './validation';

/**
 * Everything the API needs from storage. The handler depends on this interface,
 * not on DynamoDB, so unit tests can pass in an in-memory fake.
 */
export interface TaskRepository {
  /** Newest first. When `status` is given, only tasks with that status. */
  list(status?: TaskStatus): Promise<Task[]>;
  get(id: string): Promise<Task | undefined>;
  create(task: Task): Promise<void>;
  /** Returns the updated task, or undefined if no task has this id. */
  update(id: string, input: ValidTaskInput, updatedAt: string): Promise<Task | undefined>;
  /** Returns false if no task has this id. */
  delete(id: string): Promise<boolean>;
}

/** Name of the global secondary index used to list tasks by status (see template.yaml). */
export const STATUS_INDEX_NAME = 'status-createdAt-index';

export class DynamoTaskRepository implements TaskRepository {
  private readonly db: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    // Only set when running locally against DynamoDB Local. In AWS this is
    // undefined and the SDK uses the regional endpoint and the Lambda's IAM role.
    endpoint?: string,
  ) {
    this.db = DynamoDBDocumentClient.from(new DynamoDBClient({ endpoint }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async list(status?: TaskStatus): Promise<Task[]> {
    if (status) {
      // Query the GSI: reads only the items with this status, already sorted
      // by createdAt (newest first because ScanIndexForward is false).
      return this.collectPages((startKey) =>
        this.db.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: STATUS_INDEX_NAME,
            KeyConditionExpression: '#status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': status },
            ScanIndexForward: false,
            ExclusiveStartKey: startKey,
          }),
        ),
      );
    }

    // No filter: a Scan reads the whole table. Fine for a single user's
    // small table; see the README for why this would not scale.
    const tasks = await this.collectPages((startKey) =>
      this.db.send(new ScanCommand({ TableName: this.tableName, ExclusiveStartKey: startKey })),
    );
    return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<Task | undefined> {
    const result = await this.db.send(new GetCommand({ TableName: this.tableName, Key: { id } }));
    return result.Item as Task | undefined;
  }

  async create(task: Task): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: task,
        // Never silently overwrite an existing task.
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
  }

  async update(id: string, input: ValidTaskInput, updatedAt: string): Promise<Task | undefined> {
    try {
      const result = await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id },
          // "status" is a DynamoDB reserved word, so every attribute name goes
          // through a #placeholder for consistency.
          UpdateExpression:
            'SET #title = :title, #description = :description, #status = :status, #dueDate = :dueDate, #updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(id)',
          ExpressionAttributeNames: {
            '#title': 'title',
            '#description': 'description',
            '#status': 'status',
            '#dueDate': 'dueDate',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':title': input.title,
            ':description': input.description,
            ':status': input.status,
            ':dueDate': input.dueDate,
            ':updatedAt': updatedAt,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return result.Attributes as Task;
    } catch (error) {
      // The condition fails when the id does not exist, which is a 404, not a 500.
      if (error instanceof ConditionalCheckFailedException) {
        return undefined;
      }
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.send(
      new DeleteCommand({ TableName: this.tableName, Key: { id }, ReturnValues: 'ALL_OLD' }),
    );
    return result.Attributes !== undefined;
  }

  /** DynamoDB returns at most 1 MB per call; follow LastEvaluatedKey to get everything. */
  private async collectPages(
    fetchPage: (
      startKey: Record<string, unknown> | undefined,
      // Items are typed loosely, the same way the SDK types them.
    ) => Promise<{ Items?: Record<string, any>[]; LastEvaluatedKey?: Record<string, unknown> }>,
  ): Promise<Task[]> {
    const tasks: Task[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await fetchPage(startKey);
      tasks.push(...((page.Items ?? []) as Task[]));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return tasks;
  }
}
