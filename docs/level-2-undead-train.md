# Level 2 — The Undead Train

## Overview

An undead creature stalks the carriages of a moving train, attacking anything it
finds. Evade the monster, search the train for tools and holy relics, and
eventually confront it.

## Gameplay Focus

- Stealth
- Resource gathering
- Tension

## Level Details

The five carriages use collision against the actual model surfaces, including
chairs, partitions, side walls, floors, and ceilings. Thin panels block from
either side. Movement uses small collision steps to prevent sprinting through
walls, while openings in the models stay open.

A balanced triangle BVH is built in a background worker once per unique
carriage model and shared by repeated cars. Each triangle is stored once;
long train surfaces cannot multiply across spatial subdivisions. Geometry
extraction yields to the browser, and collision queries inspect only nearby
surfaces. Each instance applies its carriage offset to keep collision aligned
with the visible train. Tests exercise furniture, walls, and the aisle using
the shipped carriage geometry.

Carriage lights are spaced to cover the same route with fewer active point
lights. Debug light helpers and labels are created only when the light debug
view is enabled. The train's moonlight no longer renders a large shadow map.

