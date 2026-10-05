import path from 'node:path';

// The next-intl plugin loads @swc/core, whose native addon validates its cache folder
// (default: %LOCALAPPDATA%\swc on Windows) and refuses to load when that folder's ACL lets
// another principal replace files. On the owner's machine %LOCALAPPDATA% inherits such an
// entry, so the cache is kept inside the project (git-ignored) unless set explicitly.
process.env.SWC_NATIVE_BINDING_CACHE ??= path.join(process.cwd(), '.cache', 'swc');
