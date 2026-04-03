const { createMcpServer } = require('../src/mcp');

describe('MCP server', () => {
  test('creates server instance', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  test('server has connect method', () => {
    const server = createMcpServer();
    expect(typeof server.connect).toBe('function');
  });

  test('server has close method', () => {
    const server = createMcpServer();
    expect(typeof server.close).toBe('function');
  });
});
