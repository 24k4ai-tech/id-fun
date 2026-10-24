export function isGameWrite(path) {
  return /^\/api\/(?:journey\/|battle\/|moba\/|city-life\/)/.test(path) ||
    ['/api/action','/api/arena-signal','/api/pvp/command','/api/pvp/challenge','/api/pvp/challenge/respond'].includes(path);
}
