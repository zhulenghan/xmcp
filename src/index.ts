#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BEARER_TOKEN = process.env.X_BEARER_TOKEN;
if (!BEARER_TOKEN) {
  console.error("Error: X_BEARER_TOKEN environment variable is required.");
  process.exit(1);
}

const BASE_URL = "https://api.x.com/2";

async function xFetch(
  path: string,
  params: Record<string, string | number>
): Promise<string> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  return res.text();
}

const server = new McpServer({ name: "@lenghanz/x-mcp", version: "1.0.0" });

server.registerTool(
  "search_posts_recent",
  {
    title: "Search Recent Posts on X",
    description: "Search posts on X from the last 7 days. Supports X search operators (e.g. 'TSLA lang:en -is:retweet').",
    inputSchema: {
      query: z.string().describe("Search query"),
      max_results: z.number().int().min(10).max(100).optional().describe("10-100, default 10"),
    },
  },
  async ({ query, max_results }) => {
    const result = await xFetch("/tweets/search/recent", {
      query,
      max_results: max_results ?? 10,
      "tweet.fields": "created_at,author_id,text,public_metrics",
      expansions: "author_id",
      "user.fields": "name,username",
    });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.registerTool(
  "get_user_by_username",
  {
    title: "Get X User Profile",
    description: "Get public profile information for an X user by their username.",
    inputSchema: {
      username: z.string().describe("X username without the @ symbol (e.g. 'elonmusk')"),
    },
  },
  async ({ username }) => {
    const result = await xFetch(`/users/by/username/${username}`, {
      "user.fields": "description,public_metrics,created_at,verified",
    });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.registerTool(
  "get_user_recent_posts",
  {
    title: "Get User's Recent Posts",
    description: "Get the most recent posts from a specific X user.",
    inputSchema: {
      username: z.string().describe("X username without the @ symbol"),
      max_results: z.number().int().min(5).max(100).optional().describe("5-100, default 10"),
    },
  },
  async ({ username, max_results }) => {
    const userJson = await xFetch(`/users/by/username/${username}`, {});
    const user = JSON.parse(userJson) as { data?: { id?: string } };
    if (!user?.data?.id) {
      return { content: [{ type: "text" as const, text: userJson }] };
    }
    const result = await xFetch(`/users/${user.data.id}/tweets`, {
      max_results: max_results ?? 10,
      "tweet.fields": "created_at,text,public_metrics",
      exclude: "retweets,replies",
    });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
