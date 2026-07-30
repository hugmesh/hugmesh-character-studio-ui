# Combination coverage — boundary picks, hybrid mode and the large-slot filter.
#
# OFFLINE (@-untagged). "All combinations" is made tractable: the FIRST/LAST
# sweep steps LOOP programmatically over every live slot fieldset (boundary
# combos per the hardening brief); the truly exhaustive per-part matrix is the
# node-side `npm run compose:sweep`. The sweeps run on the two big new packs —
# menagerie-v1 (189 parts, 54-part head slot) and anime-v1 (48 parts).
#
# NOTE (real behaviour, on purpose): picking a new body/head archetype mid-sweep
# re-filters LATER slots' offered parts; the steps re-query each list live, so
# the sweep exercises exactly the lists a user would see after each pick.
Feature: Boundary part combinations, hybrid mode and slot filtering
  As someone mixing parts across large packs
  I want edge picks, hybrid cross-archetype lists and slot filtering to hold up
  So that even the biggest slots stay usable and valid

  Scenario Outline: picking the FIRST offered part of every <packId> slot stays valid
    Given the character studio is loaded
    When I switch to the "<packId>" pack expecting 12 slots
    And I pick the first offered part in every slot
    Then every required slot has a selected part
    And the canvas renders a composed character
    And the validity note reads "Ready to export"

    Examples:
      | packId       |
      | menagerie-v1 |
      | anime-v1     |

  Scenario Outline: picking the LAST offered part of every <packId> slot stays valid
    Given the character studio is loaded
    When I switch to the "<packId>" pack expecting 12 slots
    When I note the current canvas
    And I pick the last offered part in every slot
    Then every required slot has a selected part
    And the canvas layer changes
    And the canvas renders a composed character
    And the validity note reads "Ready to export"

    Examples:
      | packId       |
      | menagerie-v1 |
      | anime-v1     |

  Scenario: hybrid mode offers at least as many parts in every menagerie slot
    Given the character studio is loaded
    When I switch to the "menagerie-v1" pack expecting 12 slots
    And I note the offered part counts per slot
    And I toggle hybrid mode
    Then every slot offers at least as many parts as noted
    And the total number of offered parts strictly increases
    When I toggle hybrid mode
    Then every slot offers at least as many parts as noted

  # INTENDED behaviour, pinned: srd-taxonomy's optional "feature" slot ships
  # only avian/humanoid-compatible parts (beak, tiefling horns), so the canid
  # default head leaves it EMPTY under the compatibility filter — and hybrid
  # mode is exactly the control that reveals those cross-species parts.
  Scenario: an optional slot emptied by the compatibility filter is revealed by hybrid mode
    Given the character studio is loaded
    When I switch to the "srd-taxonomy-v1" pack expecting 4 slots
    Then the "feature" slot offers no parts
    When I toggle hybrid mode
    Then the "feature" slot offers at least 2 parts

  Scenario: the head-slot filter narrows 54 heads to the matching few and restores
    Given the character studio is loaded
    When I switch to the "menagerie-v1" pack expecting 12 slots
    And I note the offered part counts per slot
    And I filter the "head" slot parts with "otter"
    Then the "head" slot offers only parts whose label contains "otter"
    And clearing the "head" slot filter restores its parts
