# "Surprise me" randomizer — a random-but-VALID character every time.
#
# OFFLINE (@-untagged). The button uses Math.random (unseeded by design — the
# seedable core is unit-tested in util/randomize.spec.ts and swept node-side by
# compose:sweep), so these scenarios assert the INVARIANTS every roll must hold:
# required slots pressed, validity "Ready to export", a composed canvas. Run on
# the default pack plus the two big new packs, twice each — a second roll must
# hold the same invariants (and never crash on an already-random character).
Feature: Surprise-me randomizer always yields a valid character
  As someone who wants a starting point
  I want every random roll to be complete and renderable
  So that "Surprise me" never strands me with a broken character

  Scenario: randomizing the default pack keeps the character valid
    Given the character studio is loaded
    When I surprise myself
    Then every required slot has a selected part
    And the canvas renders a composed character
    And the validity note reads "Ready to export"
    When I surprise myself
    Then every required slot has a selected part
    And the validity note reads "Ready to export"

  Scenario Outline: randomizing <packId> keeps the character valid
    Given the character studio is loaded
    When I switch to the "<packId>" pack expecting 12 slots
    And I surprise myself
    Then every required slot has a selected part
    And the canvas renders a composed character
    And the validity note reads "Ready to export"
    When I surprise myself
    Then every required slot has a selected part
    And the validity note reads "Ready to export"

    Examples:
      | packId       |
      | menagerie-v1 |
      | anime-v1     |
