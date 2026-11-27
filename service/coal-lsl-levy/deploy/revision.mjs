// The revision the Worker's manifest reports: HEAD, marked -dirty when the service, the engine
// or the register has uncommitted changes, or null where `git` fails (an archive has no Git
// revision). `git(...args)` returns the command's trimmed output and throws on failure.
export function codeRevision(git) {
  try {
    const changed = git('status', '--porcelain', '--untracked-files=normal', '--',
      'service/coal-lsl-levy', 'assets/levy.mjs', 'rates/register');
    return git('rev-parse', 'HEAD') + (changed ? '-dirty' : '');
  } catch {
    return null;
  }
}
