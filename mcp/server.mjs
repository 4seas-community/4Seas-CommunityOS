#!/usr/bin/env node
/**
 * Minimal MCP server (stdio, JSON-RPC 2.0) for 4Seas CommunityOS.
 *
 * Zero dependencies on purpose: the Model Context Protocol handshake is small,
 * and keeping the server dependency-free means agents can run it with plain
 * node. Every tool proxies the Agent API, so the same auth, scopes, draft
 * confirmation and audit rules apply (docs/04 §5-6).
 *
 * Config:
 *   COS_API_URL    e.g. https://4seas-communityos.pages.dev
 *   COS_AGENT_KEY  an agent API key (cos_ak_...)
 *
 * Usage (Claude Desktop / any MCP client):
 *   { "command": "node", "args": ["mcp/server.mjs"], "env": { ... } }
 */
import { createInterface } from 'node:readline';

const API = (process.env.COS_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const KEY = process.env.COS_AGENT_KEY ?? '';

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.error?.message ?? 'HTTP ' + res.status;
    throw new Error(message);
  }
  return data;
}

/** Tool registry: name -> { description, inputSchema, run(args) }. */
const TOOLS = {
  search_venues: {
    description: 'List bookable venues with capacity, amenities and booking rules.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => api('GET', '/v1/agent/venues'),
  },
  check_availability: {
    description: 'Check a venue\'s bookable slots between two ISO timestamps.',
    inputSchema: {
      type: 'object',
      properties: { venue_id: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } },
      required: ['venue_id', 'from', 'to'],
      additionalProperties: false,
    },
    run: (a) => api('GET', '/v1/agent/venues/' + a.venue_id + '/availability?from=' + encodeURIComponent(a.from) + '&to=' + encodeURIComponent(a.to)),
  },
  list_events: {
    description: 'List community events.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => api('GET', '/v1/agent/events'),
  },
  get_event: {
    description: 'Get one event with venue, host and registration counts.',
    inputSchema: { type: 'object', properties: { event_id: { type: 'string' } }, required: ['event_id'], additionalProperties: false },
    run: (a) => api('GET', '/v1/agent/events/' + a.event_id),
  },
  create_event_draft: {
    description:
      'Draft a new event. Returns a draft_id and preview; nothing is created yet. Call create_event_confirm with the draft_id to publish.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startAt: { type: 'string' },
        endAt: { type: 'string' },
        timezone: { type: 'string' },
        venueId: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'startAt', 'endAt'],
      additionalProperties: true,
    },
    run: (a) => api('POST', '/v1/agent/events/draft', a),
  },
  create_event_confirm: {
    description: 'Confirm a previously created event draft (creates the event).',
    inputSchema: { type: 'object', properties: { draft_id: { type: 'string' } }, required: ['draft_id'], additionalProperties: false },
    run: (a) => api('POST', '/v1/agent/events/draft/' + a.draft_id + '/confirm'),
  },
  cancel_draft: {
    description: 'Cancel an unconfirmed draft (idempotent).',
    inputSchema: { type: 'object', properties: { draft_id: { type: 'string' } }, required: ['draft_id'], additionalProperties: false },
    run: (a) => api('DELETE', '/v1/agent/events/draft/' + a.draft_id),
  },
  create_booking_draft: {
    description: 'Draft a venue booking for a meeting or session. Confirm with create_booking_confirm.',
    inputSchema: {
      type: 'object',
      properties: {
        venueId: { type: 'string' },
        startAt: { type: 'string' },
        endAt: { type: 'string' },
        attendeesCount: { type: 'number' },
        purpose: { type: 'string' },
      },
      required: ['venueId', 'startAt', 'endAt', 'attendeesCount'],
      additionalProperties: true,
    },
    run: (a) => api('POST', '/v1/agent/bookings/draft', a),
  },
  create_booking_confirm: {
    description: 'Confirm a previously created booking draft.',
    inputSchema: { type: 'object', properties: { draft_id: { type: 'string' } }, required: ['draft_id'], additionalProperties: false },
    run: (a) => api('POST', '/v1/agent/bookings/draft/' + a.draft_id + '/confirm'),
  },
};

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: '4seas-communityos', version: '0.1.0' },
    });
  }
  if (method === 'tools/list') {
    return reply(id, {
      tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })),
    });
  }
  if (method === 'tools/call') {
    const tool = TOOLS[params?.name];
    if (!tool) return replyError(id, -32601, 'unknown tool: ' + params?.name);
    try {
      const result = await tool.run(params.arguments ?? {});
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } catch (err) {
      return reply(id, { content: [{ type: 'text', text: 'Error: ' + err.message }], isError: true });
    }
  }
  if (method === 'notifications/initialized') return;
  return replyError(id, -32601, 'unsupported method: ' + method);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const msg = JSON.parse(trimmed);
    void handle(msg);
  } catch {
    replyError(null, -32700, 'parse error');
  }
});
