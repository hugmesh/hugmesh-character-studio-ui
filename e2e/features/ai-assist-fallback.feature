# AI assist — the LOCAL keyword heuristic (offline fallback, B0 §8a).
#
# OFFLINE (@-untagged): the character-ai service degrades to a pure in-browser
# keyword heuristic (CharacterAiService.localSuggest) whenever the edge-AI seam is
# unreachable — which is exactly the case against `ng serve character-studio` (no
# backend: the POST to /bff/user/vn-character/suggest never returns ok, so suggest
# falls through to the heuristic). This whole path was previously UNTESTED (the AI
# feature was entirely @cluster). The assertions are non-vacuous: the heuristic
# must parse the free-text description and APPLY it — "blue" drives the fur input
# to #2e6fc0 and "cyan eyes" drives the iris input to #00b8c4 (the two colour maps
# in the service), and the canvas re-composes to reflect them.
Feature: AI assist local heuristic proposes a character offline
  As someone with no edge-AI node
  I want "describe your character" to still propose something
  So that the feature degrades gracefully instead of doing nothing

  Scenario: describing a character offline applies the local heuristic suggestion
    Given the character studio is loaded
    When I note the current canvas
    And I describe my character as "a blue wolf with cyan eyes"
    And I generate a character
    Then the AI status reports a suggestion was applied
    And the canvas layer changes
    And the "fur" colour input shows "#2e6fc0"
    And the "iris" colour input shows "#00b8c4"
