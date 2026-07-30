# Pack switching — every enabled pack loads, renders its slots and composes.
#
# OFFLINE (@-untagged): packs are static assets; the pack picker re-seeds the
# character state and recomposes the canvas with no backend. The slot counts in
# the Examples are each pack's REAL slot count (pack.json) — the deterministic
# "the new pack finished rendering" marker the switch step waits on.
#
# REQUIRED slots only: an OPTIONAL slot may legitimately offer zero parts under
# the compatibility filter (srd-taxonomy's "feature" slot is avian/humanoid-only,
# so the canid default head empties it until hybrid mode — covered as intended
# behaviour in combinations.feature). An empty REQUIRED slot would soft-lock.
Feature: Pack switching loads every enabled asset pack
  As someone choosing an art style
  I want each pack in the picker to load with all its slots and a composed preview
  So that every art set is actually usable, not just listed

  Scenario Outline: switching to <packId> renders its slots and composes
    Given the character studio is loaded
    When I switch to the "<packId>" pack expecting <slots> slots
    Then the pack select shows "<packId>"
    And every required slot offers at least one part option
    And the canvas renders a composed character
    And the validity note reads "Ready to export"

    Examples:
      | packId          | slots |
      | base-anthro-v1  | 5     |
      | srd-taxonomy-v1 | 4     |
      | menagerie-v1    | 12    |
      | anime-v1        | 12    |
