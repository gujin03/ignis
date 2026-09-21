function sortPaths(paths) {
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function sortNodes(nodes) {
  nodes.sort((a, b) => a.name.localeCompare(b.name));

  for (const node of nodes) {
    sortNodes(node.children);
  }
}

function buildTree(folders) {
  const nodes = new Map();
  const roots = [];

  for (const folder of folders) {
    let siblings = roots;
    let path = "";

    for (const name of folder.split("/")) {
      path = path === "" ? name : `${path}/${name}`;
      let node = nodes.get(path);

      if (!node) {
        node = { path, name, children: [] };
        nodes.set(path, node);
        siblings.push(node);
      }

      siblings = node.children;
    }
  }

  sortNodes(roots);

  return roots;
}

// ob skips everything under an excluded folder
function isCovered(path, excluded) {
  return excluded.some((entry) => path.startsWith(`${entry}/`));
}

function withExcluded(excluded, path) {
  const kept = excluded.filter(
    (entry) => entry !== path && !entry.startsWith(`${path}/`),
  );

  return sortPaths([...kept, path]);
}

function withoutExcluded(excluded, path) {
  return sortPaths(excluded.filter((entry) => entry !== path));
}

function notInVault(excluded, folders) {
  const known = new Set(folders);

  return sortPaths(excluded.filter((entry) => !known.has(entry)));
}

function matchesFilter(path, filter) {
  const needle = filter.trim().toLowerCase();

  if (needle === "") {
    return true;
  }

  return path.toLowerCase().includes(needle);
}

function visiblePaths(folders, filter) {
  const visible = new Set();

  for (const folder of folders) {
    if (!matchesFilter(folder, filter)) {
      continue;
    }

    let path = "";

    for (const name of folder.split("/")) {
      path = path === "" ? name : `${path}/${name}`;
      visible.add(path);
    }
  }

  return visible;
}

export {
  buildTree,
  isCovered,
  withExcluded,
  withoutExcluded,
  notInVault,
  matchesFilter,
  visiblePaths,
};
