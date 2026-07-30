# Draw — freehand a part, undo/clear the strokes, apply it to (and remove it from)
# the character (B0 drawable, v2 §2).
#
# OFFLINE (@-untagged): drawing (perfect-freehand), undo, clear, apply (client
# sanitize → addUserPart), and remove (clearUserPart) are ALL pure-client — no
# backend. NOTE: `Remove from slot` here removes the user-DRAWN override
# (clearUserPart); despite the name it does NOT touch the session/profile (the only
# cross-surface write is set-as-avatar — see avatar.feature). Persisting a drawn
# part as a reusable, shareable asset (server SANITIZE→MODERATE→STORE) is the
# off-stack step and is NOT exercised here.
Feature: Draw surface — stroke, undo, clear, apply, remove
  As someone drawing a custom part
  I want strokes, undo, clear, apply and remove to work on the surface and canvas
  So that I can iterate on a drawn part live

  Scenario: strokes accumulate, undo removes the last, clear empties the surface
    Given the character studio is loaded
    Then the drawing surface is empty
    When I draw a stroke on the drawing surface
    Then the drawing surface has 1 stroke
    When I draw a stroke on the drawing surface
    Then the drawing surface has 2 strokes
    When I undo the last stroke
    Then the drawing surface has 1 stroke
    When I clear the drawing
    Then the drawing surface is empty

  Scenario: applying a drawing adds a user-part layer; removing it reverts the canvas
    Given the character studio is loaded
    When I note the current canvas
    And I draw a stroke on the drawing surface
    And I apply the drawing to the character
    Then the canvas layer changes
    And the draw status mentions "Applied your drawing"
    When I remove my drawing from the slot
    Then the canvas returns to the noted state
    And the draw status mentions "Removed your drawing"
