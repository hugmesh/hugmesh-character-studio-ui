# AI assist — "describe → character" (B0 §8a), the LIVE edge-AI path.
#
# @cluster: Generate POSTs the prompt to the off-stack character-ai seam
# (`/bff/user/vn-character/suggest`, on-prem edge-AI via the BFF). The service
# SILENTLY falls back to a local keyword heuristic on any non-ok response and
# produces the SAME "starting point" status — so a status-only assertion cannot
# tell a live seam from a dead one. This scenario therefore captures the REAL seam
# response and asserts HTTP 200, so a 401/404/5xx seam can never masquerade as the
# edge-AI path. (The purely-offline heuristic is covered non-vacuously in
# ai-assist-fallback.feature.) GENERATED for discovery; SKIPPED at runtime unless
# E2E_LIVE=1.
@cluster
Feature: AI assist proposes and applies a character via the edge-AI seam
  As someone who wants a starting point
  I want to describe a character and have it applied to the canvas
  So that I can then adjust it by hand

  Scenario: describing a character generates and applies a suggestion to the canvas
    Given the character studio is loaded
    When I note the current canvas
    And I describe my character as "a blue wolf with cyan eyes"
    And I generate a character through the edge-AI seam
    Then the edge-AI suggest endpoint responded 200
    And the AI status reports a suggestion was applied
    And the canvas layer changes
