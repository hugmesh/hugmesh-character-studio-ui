# Part picker — choose the part in each slot (B0 §3.2).
#
# OFFLINE (@-untagged): the picker mutates the root CharacterStateService slot
# selection; each control's aria-pressed reflects the live selection, and the
# selection is EXCLUSIVE (picking one part unpresses the previous; picking None
# unpresses every part).
#
# HONEST DISCREPANCY vs the original brief (verified against the running app):
# the brief assumed picking a part re-composes the preview <img> so a canvas
# data-URL DIFF could be asserted. It cannot offline with the shipped pack. The
# only multi-part slots in base-anthro-v1 are eyes / brows / mouth — exactly the
# three slots the ALWAYS-ACTIVE "neutral" expression overrides at compose
# (SvgRigService: `partId = expressionSlots[slot] ?? base`, and a default
# character carries `defaultExpression: 'neutral'`). So a base-slot face pick is
# masked in the live preview and the composed SVG is byte-for-byte unchanged
# (body / head have a single part each, so they offer no alternative to pick).
# This feature therefore asserts the picker's REAL observable contract —
# exclusive per-slot selection — AND behaviourally pins the masking by asserting
# the canvas is unchanged. The canvas-MUTATION paths are covered elsewhere:
# palette (recolour), draw (apply a user-part, which WINS over an expression),
# and expression (swap the face layers).
Feature: Part picker selects the part in each slot
  As someone building a layered character
  I want choosing a part to become the live selection for its slot
  So that the character definition reflects my choices

  Scenario: picking a different eyes part exclusively selects it
    Given the character studio is loaded
    When I note the current canvas
    And I pick part "eyes_happy_01" for slot "eyes"
    Then part "eyes_happy_01" is selected in slot "eyes"
    And part "eyes_round_01" is not selected in slot "eyes"
    # face slots are masked by the active neutral expression, so the preview holds
    And the canvas is unchanged
    And the canvas renders a composed character

  Scenario: clearing an optional slot with None deselects its parts
    Given the character studio is loaded
    When I note the current canvas
    And I clear the "brows" slot with None
    Then the "brows" slot shows None selected
    And part "brows_neutral_01" is not selected in slot "brows"
    And the canvas is unchanged

  Scenario: re-picking the original part restores the selection
    Given the character studio is loaded
    When I pick part "eyes_happy_01" for slot "eyes"
    Then part "eyes_happy_01" is selected in slot "eyes"
    When I pick part "eyes_round_01" for slot "eyes"
    Then part "eyes_round_01" is selected in slot "eyes"
    And part "eyes_happy_01" is not selected in slot "eyes"
