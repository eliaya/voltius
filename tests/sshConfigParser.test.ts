import test from "node:test";
import assert from "node:assert/strict";
import { identityFileCandidates, parseSshConfig } from "../src/plugins/ssh-config/parser.ts";

test("inherits IdentityFile from Host * defaults", () => {
  const hosts = parseSshConfig(`
Host prod
  HostName 192.0.2.10
  User deploy

Host *
  IdentityFile ~/.ssh/id_ed25519
`);

  assert.equal(hosts.length, 1);
  assert.equal(hosts[0]?.alias, "prod");
  assert.equal(hosts[0]?.identityFile, "~/.ssh/id_ed25519");
});

test("uses alias as hostname and default key candidates when config omits HostName and IdentityFile", () => {
  const hosts = parseSshConfig(`
Host github.com
  User git
`);

  assert.equal(hosts.length, 1);
  assert.equal(hosts[0]?.hostname, "github.com");
  assert.deepEqual(identityFileCandidates(hosts[0]!), [
    "~/.ssh/id_ed25519",
    "~/.ssh/id_ecdsa",
    "~/.ssh/id_rsa",
  ]);
});
