# Palette — recolouring a tint region re-composes the canvas (B0 §3.2).
#
# OFFLINE (@-untagged): the composite root <style> emits `--region-<x>` custom
# properties from the character palette, so changing a colour changes the composed
# SVG data URL. Each region recolours INDEPENDENTLY (the v2 multi-region model), so
# two scenarios drive two different regions.
Feature: Palette recolours the composed canvas
  As someone customising a character
  I want changing a region colour to recolour the live preview
  So that I can dial in the look before exporting

  Scenario: recolouring the fur region updates the canvas
    Given the character studio is loaded
    When I note the current canvas
    And I set the "fur" colour to "#112233"
    Then the canvas layer changes
    And the "fur" colour input shows "#112233"

  Scenario: recolouring the iris region updates the canvas independently
    Given the character studio is loaded
    When I note the current canvas
    And I set the "iris" colour to "#aa00ff"
    Then the canvas layer changes
    And the "iris" colour input shows "#aa00ff"
