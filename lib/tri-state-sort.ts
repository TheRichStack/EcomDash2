export type TriStateSortDirection = "asc" | "desc"

export type TriStateSortState<TSortKey extends string> = {
  key: TSortKey
  direction: TriStateSortDirection
}

export function isTriStateSortState<TSortKey extends string>(
  currentSort: TriStateSortState<TSortKey>,
  targetSort: TriStateSortState<TSortKey>
) {
  return (
    currentSort.key === targetSort.key &&
    currentSort.direction === targetSort.direction
  )
}

export function getNextTriStateSort<TSortKey extends string>(args: {
  currentSort: TriStateSortState<TSortKey>
  nextKey: TSortKey
  defaultSort: TriStateSortState<TSortKey>
  getInitialDirection: (key: TSortKey) => TriStateSortDirection
}): TriStateSortState<TSortKey> {
  const { currentSort, nextKey, defaultSort, getInitialDirection } = args
  const initialDirection = getInitialDirection(nextKey)

  if (currentSort.key !== nextKey) {
    return {
      key: nextKey,
      direction: initialDirection,
    }
  }

  if (currentSort.direction === initialDirection) {
    return {
      key: nextKey,
      direction: initialDirection === "asc" ? "desc" : "asc",
    }
  }

  return defaultSort
}
