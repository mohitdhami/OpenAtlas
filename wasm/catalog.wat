;; Open Atlas search core
;;
;; A small, dependency-free WebAssembly module that owns catalog search and
;; facet filtering. The host writes the normalized catalog into linear memory
;; once, then calls `filter` whenever the query or filters change.
;;
;; ABI v1
;;   alloc(size) -> pointer
;;   init(resourceCount, kinds, categories, licenses, access, saved, offsets,
;;        lengths, corpus, query, results)
;;   filter(kind, category, licenseMask, access, savedOnly, queryLength)
;;     -> number of matching resource indices written to `results`
;;   abi_version() -> 1
;;   resource_count() -> initialized resource count
;;
;; Codes
;;   kind:     0 = all, 1 = dataset, 2 = model
;;   category: -1 = all, otherwise the index of the category
;;   license:  0 = permissive, 1 = conditional, 2 = noncommercial, 3 = research
;;   access:   0 = all, otherwise access code + 1
;;             (open = 1, gated = 2, application = 3)

(module
  ;; Two pages are enough for the current catalog. `alloc` grows the heap when
  ;; a larger catalog or query buffer needs more room.
  (memory (export "memory") 2)

  (global $heap (mut i32) (i32.const 1024))
  (global $count (mut i32) (i32.const 0))
  (global $kindPtr (mut i32) (i32.const 0))
  (global $categoryPtr (mut i32) (i32.const 0))
  (global $licensePtr (mut i32) (i32.const 0))
  (global $accessPtr (mut i32) (i32.const 0))
  (global $savedPtr (mut i32) (i32.const 0))
  (global $offsetsPtr (mut i32) (i32.const 0))
  (global $lengthsPtr (mut i32) (i32.const 0))
  (global $corpusPtr (mut i32) (i32.const 0))
  (global $queryPtr (mut i32) (i32.const 0))
  (global $resultPtr (mut i32) (i32.const 0))

  (func $alloc (export "alloc") (param $size i32) (result i32)
    (local $ptr i32)
    (local $end i32)

    ;; Keep every allocation 8-byte aligned for typed-array views.
    (local.set $ptr
      (i32.and
        (i32.add (global.get $heap) (i32.const 7))
        (i32.const -8)
      )
    )
    (local.set $end (i32.add (local.get $ptr) (local.get $size)))

    (block $done
      (loop $grow
        (br_if $done
          (i32.le_u
            (local.get $end)
            (i32.shl (memory.size) (i32.const 16))
          )
        )
        (if (i32.lt_s (memory.grow (i32.const 1)) (i32.const 0))
          (then (unreachable))
        )
        (br $grow)
      )
    )

    (global.set $heap (local.get $end))
    (local.get $ptr)
  )

  (func (export "init")
    (param $resourceCount i32)
    (param $kinds i32)
    (param $categories i32)
    (param $licenses i32)
    (param $access i32)
    (param $saved i32)
    (param $offsets i32)
    (param $lengths i32)
    (param $corpus i32)
    (param $query i32)
    (param $results i32)

    (global.set $count (local.get $resourceCount))
    (global.set $kindPtr (local.get $kinds))
    (global.set $categoryPtr (local.get $categories))
    (global.set $licensePtr (local.get $licenses))
    (global.set $accessPtr (local.get $access))
    (global.set $savedPtr (local.get $saved))
    (global.set $offsetsPtr (local.get $offsets))
    (global.set $lengthsPtr (local.get $lengths))
    (global.set $corpusPtr (local.get $corpus))
    (global.set $queryPtr (local.get $query))
    (global.set $resultPtr (local.get $results))
  )

  (func (export "abi_version") (result i32)
    (i32.const 1)
  )

  (func (export "resource_count") (result i32)
    (global.get $count)
  )

  ;; Byte-wise substring search over the lowercased UTF-8 corpus.
  (func $contains
    (param $haystack i32)
    (param $haystackLength i32)
    (param $needle i32)
    (param $needleLength i32)
    (result i32)
    (local $i i32)
    (local $j i32)
    (local $lastStart i32)

    (if (i32.eqz (local.get $needleLength))
      (then (return (i32.const 1)))
    )
    (if (i32.gt_u (local.get $needleLength) (local.get $haystackLength))
      (then (return (i32.const 0)))
    )

    (local.set $lastStart
      (i32.sub (local.get $haystackLength) (local.get $needleLength))
    )

    (block $notFound
      (loop $start
        (br_if $notFound
          (i32.gt_u (local.get $i) (local.get $lastStart))
        )
        (local.set $j (i32.const 0))

        (block $mismatch
          (loop $compare
            (br_if $mismatch
              (i32.ge_u (local.get $j) (local.get $needleLength))
            )
            (br_if $mismatch
              (i32.ne
                (i32.load8_u
                  (i32.add
                    (local.get $haystack)
                    (i32.add (local.get $i) (local.get $j))
                  )
                )
                (i32.load8_u
                  (i32.add (local.get $needle) (local.get $j))
                )
              )
            )
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $compare)
          )
        )

        (if (i32.eq (local.get $j) (local.get $needleLength))
          (then (return (i32.const 1)))
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $start)
      )
    )

    (i32.const 0)
  )

  (func (export "filter")
    (param $kind i32)
    (param $category i32)
    (param $licenseMask i32)
    (param $access i32)
    (param $savedOnly i32)
    (param $queryLength i32)
    (result i32)
    (local $i i32)
    (local $skip i32)
    (local $matched i32)
    (local $offset i32)
    (local $length i32)
    (local $qpos i32)
    (local $wordStart i32)
    (local $wordLength i32)
    (local $resultCount i32)

    (local.set $i (i32.const 0))
    (local.set $resultCount (i32.const 0))

    (block $recordsDone
      (loop $record
        (br_if $recordsDone
          (i32.ge_u (local.get $i) (global.get $count))
        )
        (local.set $skip (i32.const 0))

        ;; Kind facet.
        (if
          (i32.and
            (i32.ne (local.get $kind) (i32.const 0))
            (i32.ne
              (i32.load8_u
                (i32.add (global.get $kindPtr) (local.get $i))
              )
              (local.get $kind)
            )
          )
          (then (local.set $skip (i32.const 1)))
        )

        ;; Category facet.
        (if (i32.ge_s (local.get $category) (i32.const 0))
          (then
            (if
              (i32.ne
                (i32.load8_u
                  (i32.add (global.get $categoryPtr) (local.get $i))
                )
                (local.get $category)
              )
              (then (local.set $skip (i32.const 1)))
            )
          )
        )

        ;; License class bitmask facet.
        (if (i32.ne (local.get $licenseMask) (i32.const 0))
          (then
            (if
              (i32.eqz
                (i32.and
                  (local.get $licenseMask)
                  (i32.shl
                    (i32.const 1)
                    (i32.load8_u
                      (i32.add (global.get $licensePtr) (local.get $i))
                    )
                  )
                )
              )
              (then (local.set $skip (i32.const 1)))
            )
          )
        )

        ;; Access facet.
        (if (i32.ne (local.get $access) (i32.const 0))
          (then
            (if
              (i32.ne
                (i32.add
                  (i32.load8_u
                    (i32.add (global.get $accessPtr) (local.get $i))
                  )
                  (i32.const 1)
                )
                (local.get $access)
              )
              (then (local.set $skip (i32.const 1)))
            )
          )
        )

        ;; Saved-only facet.
        (if
          (i32.and
            (i32.ne (local.get $savedOnly) (i32.const 0))
            (i32.eqz
              (i32.load8_u
                (i32.add (global.get $savedPtr) (local.get $i))
              )
            )
          )
          (then (local.set $skip (i32.const 1)))
        )

        (if (i32.eqz (local.get $skip))
          (then
            (local.set $offset
              (i32.load
                (i32.add
                  (global.get $offsetsPtr)
                  (i32.shl (local.get $i) (i32.const 2))
                )
              )
            )
            (local.set $length
              (i32.load
                (i32.add
                  (global.get $lengthsPtr)
                  (i32.shl (local.get $i) (i32.const 2))
                )
              )
            )

            ;; Every whitespace-separated query word must appear in the
            ;; resource corpus. An empty query matches every remaining row.
            (local.set $matched (i32.const 1))
            (local.set $qpos (i32.const 0))

            (block $searchDone
              (loop $wordLoop
                (br_if $searchDone
                  (i32.ge_u (local.get $qpos) (local.get $queryLength))
                )

                (block $spacesDone
                  (loop $spaces
                    (br_if $spacesDone
                      (i32.or
                        (i32.ge_u
                          (local.get $qpos)
                          (local.get $queryLength)
                        )
                        (i32.ne
                          (i32.load8_u
                            (i32.add
                              (global.get $queryPtr)
                              (local.get $qpos)
                            )
                          )
                          (i32.const 32)
                        )
                      )
                    )
                    (local.set $qpos
                      (i32.add (local.get $qpos) (i32.const 1))
                    )
                    (br $spaces)
                  )
                )

                (br_if $searchDone
                  (i32.ge_u (local.get $qpos) (local.get $queryLength))
                )
                (local.set $wordStart (local.get $qpos))

                (block $wordDone
                  (loop $word
                    (br_if $wordDone
                      (i32.or
                        (i32.ge_u
                          (local.get $qpos)
                          (local.get $queryLength)
                        )
                        (i32.eq
                          (i32.load8_u
                            (i32.add
                              (global.get $queryPtr)
                              (local.get $qpos)
                            )
                          )
                          (i32.const 32)
                        )
                      )
                    )
                    (local.set $qpos
                      (i32.add (local.get $qpos) (i32.const 1))
                    )
                    (br $word)
                  )
                )

                (local.set $wordLength
                  (i32.sub (local.get $qpos) (local.get $wordStart))
                )

                (if
                  (i32.eqz
                    (call $contains
                      (i32.add
                        (global.get $corpusPtr)
                        (local.get $offset)
                      )
                      (local.get $length)
                      (i32.add
                        (global.get $queryPtr)
                        (local.get $wordStart)
                      )
                      (local.get $wordLength)
                    )
                  )
                  (then
                    (local.set $matched (i32.const 0))
                    (br $searchDone)
                  )
                )
                (br $wordLoop)
              )
            )

            (if (local.get $matched)
              (then
                (i32.store
                  (i32.add
                    (global.get $resultPtr)
                    (i32.shl (local.get $resultCount) (i32.const 2))
                  )
                  (local.get $i)
                )
                (local.set $resultCount
                  (i32.add (local.get $resultCount) (i32.const 1))
                )
              )
            )
          )
        )

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $record)
      )
    )

    (local.get $resultCount)
  )
)
