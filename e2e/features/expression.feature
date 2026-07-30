# Expression preview — swap eyes/brows/mouth layers at compose, PREVIEW ONLY.
#
# OFFLINE (@-untagged): expression presets are static `expressions/<id>.json` assets
# loaded at studio init. Selecting one applies its slot overrides at compose (the
# base character is NEVER mutated), so switching back to neutral restores the exact
# base composition — the scenario proves both directions against the canvas data URL.
Feature: Expression preview swaps face layers non-destructively
  As someone previewing expressions
  I want to try an expression and return to the base look unchanged
  So that previews never alter my saved character

  Scenario: previewing happy swaps the face; neutral restores the base canvas
    Given the character studio is loaded
    When I note the current canvas
    And I preview the "happy" expression
    Then the "happy" expression is active
    And the canvas layer changes
    When I preview the "neutral" expression
    Then the "neutral" expression is active
    And the canvas returns to the noted state

  # ALL FOUR presets (hardening sweep): every preset must activate, recompose,
  # and restore exactly — neutral is asserted via the restore leg of each row.
  Scenario Outline: the <id> preset activates, recomposes and restores
    Given the character studio is loaded
    When I note the current canvas
    And I preview the "<id>" expression
    Then the "<id>" expression is active
    And the canvas layer changes
    When I preview the "neutral" expression
    Then the "neutral" expression is active
    And the canvas returns to the noted state

    Examples:
      | id    |
      | happy |
      | sad   |
      | angry |

  # The expression matrix also holds on the NEW packs (menagerie/anime ship the
  # same four presets over their own eyes/brows/mouth parts).
  Scenario Outline: menagerie previews <id> and restores
    Given the character studio is loaded
    When I switch to the "menagerie-v1" pack expecting 12 slots
    And I note the current canvas
    And I preview the "<id>" expression
    Then the "<id>" expression is active
    And the canvas layer changes
    When I preview the "neutral" expression
    Then the canvas returns to the noted state

    Examples:
      | id    |
      | happy |
      | sad   |
      | angry |
