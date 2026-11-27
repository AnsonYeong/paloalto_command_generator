import test from 'node:test'
import assert from 'node:assert/strict'
import { addressError, emptyWorkspace, exampleWorkspace, generateCommands, nameError, normalizeAddress, parseBulkAddresses, portsError, readWorkspace, suggestedName, validateWorkspace } from '../src/lib/generator.ts'

test('valid IPv4 hosts and CIDR boundary prefixes', () => {
  for (const ip of ['192.168.10.10', '0.0.0.0/0', '255.255.255.255/32', '10.0.0.0/24']) assert.equal(addressError('ip-netmask', ip), null, ip)
  assert.equal(normalizeAddress('ip-netmask', '192.168.1.10'), '192.168.1.10/32')
})
test('reject ambiguous and malformed IPv4 addresses', () => {
  for (const ip of ['256.1.1.1', '01.2.3.4', '127.1', '1.2.3', '1.2.3.4/33', '1.2.3.4/', '1.2.3.4/24/1', '1.2.3.4\ncommit', '']) assert.ok(addressError('ip-netmask', ip), ip)
})
test('IPv6 compression, mapped addresses, and prefix boundaries', () => {
  for (const ip of ['::1', '2001:db8::1/128', '::/0', '::ffff:192.0.2.1', '2001:db8:0:1:2:3:4:5/64']) assert.equal(addressError('ip-netmask', ip), null, ip)
  assert.equal(normalizeAddress('ip-netmask', '2001:db8::1'), '2001:db8::1/128')
  for (const ip of ['2001:db8::1/129', '2001:::1', '2001:db8::g', 'fe80::1%eth0', '::ffff:999.0.0.1']) assert.ok(addressError('ip-netmask', ip), ip)
})
test('ranges compare numerically and require matching IP families', () => {
  for (const ip of ['10.0.0.9-10.0.0.10', '2001:db8::f-2001:db8::10', '10.0.0.1-10.0.0.1']) assert.equal(addressError('ip-range', ip), null, ip)
  for (const ip of ['10.0.0.10-10.0.0.9', '2001:db8::10-2001:db8::f', '10.0.0.1-::1', '10.0.0.1-10.0.0.2-extra']) assert.ok(addressError('ip-range', ip), ip)
})
test('FQDNs accept labels and reject URL or CLI syntax', () => {
  for (const fqdn of ['app.example.com', 'app-01.example.com', 'EXAMPLE.com.']) assert.equal(addressError('fqdn', fqdn), null)
  for (const fqdn of ['https://example.com', 'example.com/path', '-app.example.com', 'app..com', 'example.com\ncommit', '*.example.com']) assert.ok(addressError('fqdn', fqdn), fqdn)
})
test('ports support zero, ranges, lists, and whitespace around commas', () => {
  for (const port of ['0', '65535', '80, 443,8000-8100', '0-65535']) assert.equal(portsError(port), null)
  for (const port of ['65536', '-1', '443,', '100-99', '80;commit', '80\ncommit', '1.5', '']) assert.ok(portsError(port), port)
  assert.equal(portsError('', true), null)
})
test('names reject control characters and CLI delimiters', () => {
  assert.equal(nameError('Web Servers-01_prod'), null)
  assert.equal(nameError('NET_10.202.52.0_23'), null)
  for (const name of ['bad\ncommit', 'test"', 'test;commit', 'x'.repeat(64), ' hi', 'hi ', '[any]', '']) assert.ok(nameError(name), name)
})
test('objects precede group references and commit is opt-in', () => {
  const w = exampleWorkspace()
  const result = generateCommands(w)
  assert.deepEqual(result.issues, [])
  const lines = result.lines.map(l => l.text)
  assert.equal(lines[0], 'configure')
  assert.equal(lines[1], 'set address WEB-SERVER-01 ip-netmask 192.168.10.10/32')
  assert.ok(lines.includes('set service TCP-443 protocol tcp port 443'))
  assert.ok(lines.includes('set address-group WEB-SERVERS static WEB-SERVER-01'))
  assert.ok(lines.includes('set service-group WEB-SERVICES members TCP-443'))
  assert.ok(lines.every(line => !line.includes('"')))
  assert.ok(lines.findIndex(l => l.startsWith('set service ')) < lines.findIndex(l => l.startsWith('set service-group ')))
  assert.ok(!lines.includes('commit'))
  assert.equal(generateCommands({ ...w, includeCommit: true }).lines.at(-1).text, 'commit')
  assert.ok(generateCommands({ ...w, includeConfigure: false }).lines[0].text.startsWith('set address'))
})
test('all object and group commands respect the selected scope', () => {
  for (const [scope, scopeName, prefix] of [['firewall', '', 'set '], ['shared', '', 'set shared '], ['vsys', 'vsys2', 'set vsys vsys2 '], ['device-group', 'Branch-Firewalls', 'set device-group Branch-Firewalls '], ['device-group', 'Branch Offices', 'set device-group "Branch Offices" ']]) {
    const result = generateCommands({ ...exampleWorkspace(), scope, scopeName, includeConfigure: false })
    assert.deepEqual(result.issues, [])
    assert.ok(result.lines.every(l => l.text.startsWith(prefix)))
  }
  assert.equal(generateCommands({ ...exampleWorkspace(), scope: 'device-group', scopeName: '' }).lines.length, 0)
})
test('one group member per command keeps large groups below CLI line limits', () => {
  const w = exampleWorkspace()
  w.addresses = Array.from({ length: 200 }, (_, i) => ({ ...w.addresses[0], id: `a${i}`, name: `SERVER-${i}` }))
  w.groups = [{ id: 'g', kind: 'address', name: 'SERVERS', members: w.addresses.map(a => a.id) }]
  const output = generateCommands(w)
  assert.equal(output.lines.filter(l => l.section === 'Groups').length, 200)
  assert.ok(output.lines.every(l => l.text.length < 1024))
})
test('service timeout inheritance follows the selected protocol across scopes, ranges and custom names', () => {
  const services = [
    { id: 'tcp', name: 'TCP-1024-65535', protocol: 'tcp', ports: '1024-65535', sourcePorts: '', description: '' },
    { id: 'udp', name: 'UDP-53', protocol: 'udp', ports: '53', sourcePorts: '', description: '' },
    { id: 'custom-udp', name: 'TCP label for DNS', protocol: 'udp', ports: '53,123', sourcePorts: '', description: '' },
    { id: 'custom-tcp', name: 'UDP label for Web', protocol: 'tcp', ports: '443', sourcePorts: '1024-65535', description: '' },
  ]
  const commands = [
    'service TCP-1024-65535 protocol tcp port 1024-65535',
    'service TCP-1024-65535 protocol tcp override no',
    'service UDP-53 protocol udp port 53',
    'service UDP-53 protocol udp override no',
    'service "TCP label for DNS" protocol udp port 53,123',
    'service "TCP label for DNS" protocol udp override no',
    'service "UDP label for Web" protocol tcp port 443 source-port 1024-65535',
    'service "UDP label for Web" protocol tcp override no',
  ]
  for (const [scope, scopeName, prefix] of [['firewall', '', 'set'], ['shared', '', 'set shared'], ['vsys', 'vsys2', 'set vsys vsys2'], ['device-group', 'Branch Offices', 'set device-group "Branch Offices"']]) {
    const result = generateCommands({ ...emptyWorkspace(), services, scope, scopeName, includeConfigure: false })
    assert.deepEqual(result.issues, [])
    assert.deepEqual(result.lines, commands.map(command => ({ text: `${prefix} ${command}`, section: 'Services' })))
  }
})

test('destination and source ports normalize without changing their meaning', () => {
  const w = exampleWorkspace()
  w.services[0].ports = '80, 443,443,8000-8100'
  w.services[0].sourcePorts = '1024-65535'
  w.services[0].description = 'Web service'
  const lines = generateCommands(w).lines.map(l => l.text)
  assert.ok(lines.includes('set service TCP-443 protocol tcp port 80,443,8000-8100 source-port 1024-65535'))
  assert.ok(lines.includes('set service TCP-443 description "Web service"'))
})
test('names with spaces remain single CLI arguments and descriptions remain quoted', () => {
  const w = exampleWorkspace()
  w.addresses[0].name = 'Web Server'
  w.addresses[0].description = 'Primary web server'
  w.services[0].name = 'Web HTTPS'
  w.services[0].description = 'HTTPS'
  w.groups[0].name = 'Web Servers'
  w.groups[1].name = 'Web Services'
  const result = generateCommands(w)
  assert.deepEqual(result.issues, [])
  const lines = result.lines.map(l => l.text)
  assert.ok(lines.includes('set address "Web Server" ip-netmask 192.168.10.10/32'))
  assert.ok(lines.includes('set address "Web Server" description "Primary web server"'))
  assert.ok(lines.includes('set service "Web HTTPS" protocol tcp port 443'))
  assert.ok(lines.includes('set service "Web HTTPS" description "HTTPS"'))
  assert.ok(lines.includes('set address-group "Web Servers" static "Web Server"'))
  assert.ok(lines.includes('set address-group "Web Servers" static WEB-SERVER-02'))
  assert.ok(lines.includes('set service-group "Web Services" members "Web HTTPS"'))
  assert.ok(lines.includes('set service-group "Web Services" members TCP-80'))
})
test('invalid objects prevent partial or dangerous command export', () => {
  const w = exampleWorkspace()
  w.addresses[0].description = 'web"\ncommit'
  assert.equal(generateCommands(w).lines.length, 0)
  assert.ok(generateCommands(w).issues.length)
  w.addresses[0].description = 'Normal description'
  w.services[0].ports = '99999'
  assert.equal(generateCommands(w).lines.length, 0)
})
test('duplicate names share namespaces with their groups', () => {
  const w = exampleWorkspace()
  w.groups[0].name = w.addresses[0].name
  assert.ok(validateWorkspace(w).some(i => /used more than once/.test(i.message)))
  w.groups[0].name = 'UNIQUE'
  w.services[0].name = w.addresses[0].name
  assert.equal(validateWorkspace(w).length, 0, 'address and service namespaces are separate')
})
test('predefined service names cannot be overwritten', () => {
  const w = exampleWorkspace()
  w.services[0].name = 'service-https'
  assert.equal(generateCommands(w).lines.length, 0)
})
test('missing, duplicate and empty group memberships prevent export', () => {
  for (const members of [[], ['missing'], ['same', 'same']]) {
    const w = exampleWorkspace()
    w.groups[0].members = members
    assert.equal(generateCommands(w).lines.length, 0)
  }
})
test('renaming an object follows stable member IDs', () => {
  const w = exampleWorkspace()
  w.addresses[0].name = 'NEW-NAME'
  const lines = generateCommands(w).lines.map(l => l.text)
  assert.ok(lines.includes('set address-group WEB-SERVERS static NEW-NAME'))
  assert.ok(!lines.some(l => l.includes('WEB-SERVER-01')))
})
test('bulk input parses plain IPs, CSV, Excel tabs, IPv6, ranges and FQDNs', () => {
  const result = parseBulkAddresses('192.168.1.1\r\nWEB,192.168.1.2\nNET\t10.0.0.0/24\n2001:db8::1\nRANGE,10.0.0.2-10.0.0.10\nAPP,app.example.com\n')
  assert.deepEqual(result.errors, [])
  assert.equal(result.addresses.length, 6)
  assert.equal(result.addresses[0].name, 'HOST_192.168.1.1')
  assert.equal(result.addresses[0].value, '192.168.1.1/32')
  assert.equal(result.addresses[4].type, 'ip-range')
  assert.equal(result.addresses[5].type, 'fqdn')
})
test('bulk errors identify their original lines and duplicate names', () => {
  const result = parseBulkAddresses('WEB,10.0.0.1\nWEB,10.0.0.2\n\nBAD,999.1.1.1\na,b,c')
  assert.equal(result.errors.length, 3)
  assert.match(result.errors[0], /Line 2.*duplicate/)
  assert.match(result.errors[1], /Line 4/)
  assert.match(result.errors[2], /Line 5/)
})
test('workspace round trip preserves data but malformed structures are rejected', () => {
  const w = exampleWorkspace()
  assert.deepEqual(readWorkspace(JSON.parse(JSON.stringify(w))), w)
  for (const input of [null, {}, [], { ...w, version: 2 }, { ...w, addresses: [null] }, { ...w, services: [{ ...w.services[0], protocol: 'tcp\ncommit' }] }, { ...w, groups: [{ ...w.groups[0], members: [3] }] }]) assert.throws(() => readWorkspace(input))
})

test('generated address names preserve dots and use underscores in unquoted commands and group references', () => {
  assert.equal(suggestedName('ip-netmask', '10.202.52.0/23'), 'NET_10.202.52.0_23')
  const result = parseBulkAddresses('10.202.52.0/23\n10.190.27.0/24\n192.0.2.1\n198.51.100.1-198.51.100.9\napp.example.com\n2001:db8::/32')
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.addresses.map(a => a.name), ['NET_10.202.52.0_23', 'NET_10.190.27.0_24', 'HOST_192.0.2.1', 'RANGE_198.51.100.1-198.51.100.9', 'FQDN_app.example.com', 'NET_2001_db8_32'])
  const workspace = { ...emptyWorkspace(), addresses: result.addresses, groups: [{ id: 'group', name: 'NETWORKS', kind: 'address', members: [result.addresses[0].id] }] }
  const commands = generateCommands(workspace)
  assert.deepEqual(commands.issues, [])
  assert.ok(commands.lines.some(l => l.text === 'set address NET_10.202.52.0_23 ip-netmask 10.202.52.0/23'))
  assert.ok(commands.lines.some(l => l.text === 'set address-group NETWORKS static NET_10.202.52.0_23'))
  assert.ok(commands.lines.every(l => !l.text.includes('"')))
})

test('loading legacy generated names preserves values, custom names and group IDs while avoiding collisions', () => {
  const address = (id, name, value) => ({ id, name, value, type: 'ip-netmask', description: '' })
  const workspace = { ...emptyWorkspace(), addresses: [
    address('legacy', 'NET-10-202-52-0-23', '10.202.52.0/23'),
    address('custom', 'Office.Network', '198.51.100.0/24'),
    address('host', 'HOST-192-0-2-1', '192.0.2.1/32'),
    address('reserved', 'NET_10.202.52.0_23', '203.0.113.0/24'),
    address('similar', 'NET-10-202-52-0-23-custom', '10.202.52.0/23'),
  ], groups: [{ id: 'group', name: 'GROUP', kind: 'address', members: ['legacy', 'host', 'custom'] }] }
  const restored = readWorkspace(workspace)
  assert.deepEqual(restored.addresses.map(a => a.name), ['NET_10.202.52.0_23-2', 'Office.Network', 'HOST_192.0.2.1', 'NET_10.202.52.0_23', 'NET-10-202-52-0-23-custom'])
  assert.deepEqual(restored.addresses.map(a => a.value), workspace.addresses.map(a => a.value))
  assert.deepEqual(restored.groups, workspace.groups)
  assert.equal(workspace.addresses[0].name, 'NET-10-202-52-0-23', 'reading must not mutate input')
  assert.deepEqual(readWorkspace(restored), restored, 'migration is idempotent')
  assert.deepEqual(validateWorkspace(restored), [])
  assert.ok(generateCommands(restored).lines.some(l => l.text === 'set address-group GROUP static NET_10.202.52.0_23-2'))
})
test('an empty workspace does not emit configure or commit alone', () => {
  assert.deepEqual(generateCommands({ ...emptyWorkspace(), includeCommit: true }), { lines: [], issues: [] })
})
