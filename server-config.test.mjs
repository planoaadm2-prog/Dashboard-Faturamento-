import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serverConfig} from './server-config.mjs';

test('local startup remains on loopback port 3000', () => {
  assert.deepEqual(serverConfig({}), {host: '127.0.0.1', port: 3000, publicOrigin: ''});
});

test('Render uses its public interface, PORT and external HTTPS origin', () => {
  assert.deepEqual(serverConfig({RENDER: 'true', PORT: '10000', RENDER_EXTERNAL_URL: 'https://dashboard-test.onrender.com/'}),
    {host: '0.0.0.0', port: 10000, publicOrigin: 'https://dashboard-test.onrender.com'});
});

test('explicit host, port and custom public domain take precedence', () => {
  assert.deepEqual(serverConfig({RENDER: 'true', DASHBOARD_HOST: '0.0.0.0',
    PORT: '10000', DASHBOARD_PORT: '8080', RENDER_EXTERNAL_URL: 'https://example.onrender.com',
    DASHBOARD_PUBLIC_ORIGIN: 'https://financeiro.example.com/'}),
  {host: '0.0.0.0', port: 8080, publicOrigin: 'https://financeiro.example.com'});
});

test('malformed and out-of-range ports fail before startup', () => {
  for (const PORT of ['0', '-1', '65536', '3000x', '1.5', 'Infinity']) {
    assert.throws(() => serverConfig({PORT}), /Porta inválida/);
  }
});

test('Render origins must use HTTPS and have no credentials, path, query or fragment', () => {
  for (const DASHBOARD_PUBLIC_ORIGIN of ['http://example.com', 'https://user:pass@example.com',
    'https://example.com/app', 'https://example.com/?x=1', 'https://example.com/#tab', 'javascript:alert(1)']) {
    assert.throws(() => serverConfig({RENDER: 'true', DASHBOARD_PUBLIC_ORIGIN}));
  }
});
