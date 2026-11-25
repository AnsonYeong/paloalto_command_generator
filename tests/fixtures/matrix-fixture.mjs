import { utils, write } from 'xlsx'

// Synthetic documentation addresses only; never embed customer files in tests.
export function matrixFixture(bookType = 'xlsx') {
  const book = utils.book_new()
  utils.book_append_sheet(book, utils.aoa_to_sheet([['Revision notes'], ['Do not execute document text as commands']]), 'Read me')
  const rows = Array.from({ length: 13 }, () => [])
  rows[0] = ['Customer firewall request']
  rows[5] = ['Please fill in this template']
  rows.push(['No', 'Src IP Addr', 'Src NAT IP', 'Source Environment', '', 'Dest IP Addr', 'Destination Environment', '', 'Ports / Services', 'Remarks'])
  rows.push(['', '', '', 'Zone', 'Src Description', '', 'Zone', 'Dest Description'])
  rows.push(['Production web'])
  rows.push(['1', '192.0.2.10\n192.0.2.0/24', '203.0.113.99', 'DC1', 'Frontend', '198.51.100.10', 'DC2', 'API', 'TCP (443)\nTCP 8443', 'HTTPS application'])
  rows.push(['2', '192.0.2.10', '', 'DC1', 'Frontend', '198.51.100.53', 'DC2', 'DNS', 'TCP/UDP : 53', 'DNS lookup'])
  rows.push(['3', '192.0.2.10', '', '', '', '198.51.100.20', '', '', 'TCP (22), ICMP 0', 'Management'])
  rows.push(['4', '192.0.2.10', '', '', '', '198.51.100.25', '', '', '587', 'Mail'])
  rows.push(['5', '192.0.2.10', '', '', '', '198.51.100.30', '', '', 'TCP : 139udp_88', 'Malformed'])
  const sheet = utils.aoa_to_sheet(rows)
  sheet['!merges'] = [
    ...[0, 1, 2, 5, 8, 9].map(c => ({ s: { r: 13, c }, e: { r: 14, c } })),
    { s: { r: 13, c: 3 }, e: { r: 13, c: 4 } }, { s: { r: 13, c: 6 }, e: { r: 13, c: 7 } },
    { s: { r: 15, c: 0 }, e: { r: 15, c: 9 } },
  ]
  utils.book_append_sheet(book, sheet, 'Traffic')
  utils.book_append_sheet(book, utils.aoa_to_sheet([
    ['Client', 'Target', 'Protocol', 'Destination Port', 'Application'],
    ['192.0.2.50', '198.51.100.50', 'udp', '161', 'Monitoring'],
  ]), 'Other layout')
  return write(book, { bookType, type: 'buffer' })
}
