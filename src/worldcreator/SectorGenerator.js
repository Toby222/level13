// Handles the first step of world generation, the abstract world template itself
define([
	'ash',
    'utils/MathUtils',
    'game/constants/EnemyConstants',
    'game/constants/ItemConstants',
    'game/constants/LevelConstants',
    'game/constants/LocaleConstants',
    'game/constants/MovementConstants',
    'game/constants/PositionConstants',
    'game/constants/SectorConstants',
	'game/constants/TradeConstants',
    'game/constants/UpgradeConstants',
    'game/constants/WorldConstants',
	'game/vos/GangVO',
	'game/vos/LocaleVO',
	'game/vos/PathConstraintVO',
    'game/vos/PositionVO',
	'game/vos/ResourcesVO',
	'game/vos/StashVO',
	'worldcreator/WorldCreatorConstants',
    'worldcreator/WorldCreatorHelper',
    'worldcreator/WorldCreatorRandom',
    'worldcreator/WorldCreatorDebug'
], function (
    Ash, MathUtils,
    EnemyConstants, ItemConstants, LevelConstants, LocaleConstants, MovementConstants, PositionConstants, SectorConstants, TradeConstants, UpgradeConstants, WorldConstants,
    GangVO, LocaleVO, PathConstraintVO, PositionVO, ResourcesVO, StashVO,
    WorldCreatorConstants, WorldCreatorHelper, WorldCreatorRandom, WorldCreatorDebug
) {
    
    var SectorGenerator = {
        
        prepareSectors: function (seed, worldVO, itemsHelper, enemyCreator) {
            for (var l = worldVO.topLevel; l >= worldVO.bottomLevel; l--) {
                var levelVO = worldVO.levels[l];
                // level-wide features 2
                this.generateZones(seed, worldVO, levelVO);
                this.generateHazards(seed, worldVO, levelVO, itemsHelper);
                this.generateStashes(seed, worldVO, levelVO, itemsHelper);
                this.generateWorksops(seed, worldVO, levelVO);
                levelVO.paths = this.generatePaths(seed, worldVO, levelVO);
                // level path features
                for (var p = 0; p < levelVO.paths.length; p++) {
                    this.generateRequiredResources(seed, worldVO, levelVO, levelVO.paths[p]);
                }
                // sector features
                for (var s = 0; s < levelVO.sectors.length; s++) {
                    var sectorVO = levelVO.sectors[s];
                    sectorVO.sectorType = this.getSectorType(seed, worldVO, levelVO, sectorVO);
                    sectorVO.sunlit = this.isSunlit(seed, worldVO, levelVO, sectorVO);
                    sectorVO.passageUpType = this.getPassageUpType(seed, worldVO, levelVO, sectorVO);
                    sectorVO.passageDownType = this.getPassageDownType(seed, worldVO, levelVO, sectorVO);
                    this.generateTexture(seed, worldVO, levelVO, sectorVO);
                    this.generateResources(seed, worldVO, levelVO, sectorVO);
                }
                
                // level-wide features 2
                this.generateLocales(seed, worldVO, levelVO);
                this.generateMovementBlockers(seed, worldVO, levelVO);
                this.generateEnemies(seed, worldVO, levelVO, enemyCreator);
            }
            
            // debug
            // WorldCreatorDebug.printWorld(worldVO, [ "possibleEnemies.length" ]);
            // WorldCreatorDebug.printWorld(worldVO, [ "enemyDifficulty" ]);
            // WorldCreatorDebug.printWorld(worldVO, [ "hazards.radiation" ], "red");
            // WorldCreatorDebug.printWorld(worldVO, [ "resourcesAll.water"], "blue");
            // WorldCreatorDebug.printWorld(worldVO, [ "resourcesScavengable.food" ], "#ee8822");
            // WorldCreatorDebug.printWorld(worldVO, [ "workshopResource" ]);
            // WorldCreatorDebug.printWorld(worldVO, [ "criticalPaths.length" ], "red" );
        },
        
        generateZones: function (seed, worldVO, levelVO) {
            var level = levelVO.level;
			var bottomLevel = worldVO.bottomLevel;
            var isCampableLevel = levelVO.isCampable;
            var isGoingDown = level <= 13 && level >= bottomLevel;
            var passageUp = levelVO.getSector(levelVO.passageUpPosition);
            var passageDown = levelVO.getSector(levelVO.passageDownPosition);
            var passage1 = isGoingDown ? passageUp : passageDown;
            var passage2 = isGoingDown ? passageDown : passageUp;
            
            var setSectorZone = function (sector, zone, force) {
                var existingZone = sector.zone;
                if (existingZone) {
                    var existingIndex = WorldCreatorConstants.getZoneOrdinal(existingZone);
                    var newIndex = WorldCreatorConstants.getZoneOrdinal(zone);
                    if (existingIndex <= newIndex) return;
                }
                var stage = sector.stage;
                if (!WorldConstants.isAllowedZone(stage, zone)) {
                    if (force) {
                        log.w("incompatible zone: " + sector.position + " stage: " + stage + " zone: " + zone);
                    } else {
                        return;
                    }
                }
                sector.zone = zone;
            };
            
            var setAreaZone = function (sector, zone, area, forceArea) {
                forceArea = forceArea || 0;
                setSectorZone(sector, zone, forceArea > 0);
                var d = area - 1;
                for (var x = sector.position.sectorX - d; x <= sector.position.sectorX + d; x++) {
                    for (var y = sector.position.sectorY - d; y <= sector.position.sectorY + d; y++) {
                        var neighbour = levelVO.getSector(x, y);
                        if (neighbour) {
                            var path = WorldCreatorRandom.findPath(worldVO, sector.position, neighbour.position, false, true);
                            if (path && path.length <= d) {
                                setSectorZone(neighbour, zone, forceArea > path.length);
                            }
                        }
                    }
                }
            };
            
            var setPathZone = function (path, zone, area, forceArea) {
                for (var i = 0; i < path.length; i++) {
                    var pos = path[i];
                    var sector = levelVO.getSector(pos.sectorX, pos.sectorY);
                    setAreaZone(sector, zone, area, forceArea);
                }
            };
                        
            // entrance to level ZONE_ENTRANCE
            setAreaZone(passage1, WorldConstants.ZONE_ENTRANCE, level == 14 ? 4 : 2, 2);
            
            if (isCampableLevel) {
                // camp:
                var campSector = levelVO.getSector(levelVO.campPositions[0]);
                // - path to camp ZONE_PASSAGE_TO_CAMP
                if (level != 13) {
                    setAreaZone(passage1, WorldConstants.ZONE_PASSAGE_TO_CAMP, 3, 1);
                    setAreaZone(campSector, WorldConstants.ZONE_PASSAGE_TO_CAMP, 3, 1);
                    var pathToCamp = WorldCreatorRandom.findPath(worldVO, passage1.position, campSector.position, false, true, WorldConstants.CAMP_STAGE_EARLY);
                    setPathZone(pathToCamp, WorldConstants.ZONE_PASSAGE_TO_CAMP, 2, 1);
                }
                // - path to passage2 ZONE_CAMP_TO_PASSAGE
                if (passage2) {
                    var pathToCamp = WorldCreatorRandom.findPath(worldVO, campSector.position, passage2.position, false, true);
                    setPathZone(pathToCamp, WorldConstants.ZONE_CAMP_TO_PASSAGE, 1, 1);
                }
                // - rest ZONE_POI_1, ZONE_POI_2, ZONE_EXTRA_CAMPABLE depending on stage and vornoi points
                var points = WorldCreatorHelper.getVornoiPoints(seed, worldVO, levelVO);
                for (var i = 0; i < levelVO.sectors.length; i++) {
                    var sector = levelVO.sectors[i];
                    var closestPoint = null;
                    var closestPointDist = 0;
                    for (var j = 0; j < points.length; j++) {
                        var point = points[j];
                        var dist = PositionConstants.getDistanceTo(sector.position, point.position);
                        if (closestPoint == null || dist < closestPointDist) {
                            closestPoint = point;
                            closestPointDist = dist;
                        }
                    }
                    closestPoint.sectors.push(sector);
                    var zone = closestPoint.zone;
                    if (zone == WorldConstants.ZONE_POI_TEMP) {
                        zone = sector.stage == WorldConstants.CAMP_STAGE_EARLY ? WorldConstants.ZONE_POI_1 : WorldConstants.ZONE_POI_2;
                    }
                    setSectorZone(sector, zone);
                }
            } else {
                // no camp:
                // - area around passage1 and path from passage to passage is ZONE_PASSAGE_TO_PASSAGE
                setAreaZone(passage1, WorldConstants.ZONE_PASSAGE_TO_PASSAGE, 6, 2);
                if (passage2) {
                    var pathPassageToPassage = WorldCreatorRandom.findPath(worldVO, passage1.position, passage2.position, false, true);
                    setPathZone(pathPassageToPassage, WorldConstants.ZONE_PASSAGE_TO_PASSAGE, 2, true);
                }
                // - rest is ZONE_EXTRA_UNCAMPABLE
                for (var i = 0; i < levelVO.sectors.length; i++) {
                    var sector = levelVO.sectors[i];
                    setSectorZone(sector, WorldConstants.ZONE_EXTRA_UNCAMPABLE, true);
                }
            }
        },
        
        generateHazards: function (seed, worldVO, levelVO, itemsHelper) {
            var l = levelVO.level == 0 ? 1342 : levelVO.level;
            var campOrdinal = levelVO.campOrdinal;
            var levelOrdinal = levelVO.levelOrdinal;
            
            // hazard areas (cold)
            if (levelVO.level != 14) {
                for (var s = 0; s < levelVO.sectors.length; s++) {
                    // - block for certain sectors
                    var sectorVO = levelVO.sectors[s];
                    if (sectorVO.isCamp) continue;
                    if (sectorVO.isOnCriticalPath(WorldCreatorConstants.CRITICAL_PATH_TYPE_PASSAGE_TO_CAMP)) continue;
                    var x = sectorVO.position.sectorX;
                    var y = sectorVO.position.sectorY;
                    if (Math.abs(y) <= 2 && Math.abs(x) <= 2) continue;
                    var distanceToCamp = WorldCreatorHelper.getQuickDistanceToCamp(worldVO, levelVO, sectorVO);
                    var distanceToCampThreshold = l == 13 ? 6 : 3;
                    if (distanceToCamp < distanceToCampThreshold) continue;
                        
                    // - determine value range
                    var step = WorldConstants.getCampStep(sectorVO.zone);
                    var maxHazardCold = Math.min(100, itemsHelper.getMaxHazardColdForLevel(campOrdinal, step, levelVO.isHard));
                    var minHazardCold = itemsHelper.getMinHazardColdForLevel(campOrdinal, step, levelVO.isHard);
                    minHazardCold = Math.min(minHazardCold, maxHazardCold - 1);
                    minHazardCold = Math.max(minHazardCold, 1);
                    if (maxHazardCold < 5) continue;
                        
                    // - determine eligibility
                    var isEarlyZone = sectorVO.zone == WorldConstants.ZONE_PASSAGE_TO_CAMP || sectorVO.zone == WorldConstants.ZONE_PASSAGE_TO_PASSAGE;
                    var isEarlyCriticalPath = sectorVO.isOnEarlyCriticalPath();
                    var distanceToEdge = Math.min(Math.abs(y - levelVO.minY), Math.abs(y - levelVO.maxY), Math.abs(x - levelVO.minX), Math.abs(x - levelVO.maxX));
                    var edgeThreshold = isEarlyCriticalPath || isEarlyZone ? 7 : 5;
                    var centerThreshold = isEarlyCriticalPath || isEarlyZone ? WorldCreatorConstants.TOWER_RADIUS + 2 : WorldCreatorConstants.TOWER_RADIUS;
                        
                    if (l === worldVO.topLevel || distanceToEdge < edgeThreshold || Math.abs(y) > centerThreshold || Math.abs(x) > centerThreshold) {
                        var hazardValueRand = WorldCreatorRandom.random(3000 + seed / (l + 40) + x * y / 6 + seed + y * 2 + l * l * 959);
                        var value = hazardValueRand * 100;
                        if (value < minHazardCold) value = minHazardCold;
                        if (value > maxHazardCold) value = maxHazardCold;
                        if (value > 10) {
                            value = Math.floor(value / 5) * 5;
                        } else {
                            value = Math.floor(value);
                        }
                        sectorVO.hazards.cold = value;
                    }
                }
            }
            
            // hazard clusters (radiation and poison)
            if (levelOrdinal < WorldCreatorConstants.MIN_LEVEL_ORDINAL_HAZARD_RADIATION && levelOrdinal < WorldCreatorConstants.MIN_LEVEL_ORDINAL_HAZARD_POISON) {
                return;
            }
                
            var isPollutedLevel = levelVO.notCampableReason === LevelConstants.UNCAMPABLE_LEVEL_TYPE_POLLUTION;
            var isRadiatedLevel = levelVO.notCampableReason === LevelConstants.UNCAMPABLE_LEVEL_TYPE_RADIATION;
            
            var getMaxValue = function (sectorVO, isRadiation, zone) {
                var step = WorldConstants.getCampStep(zone);
                if (sectorVO.hazards.cold) return 0;
                if (isRadiation) {
                    return Math.min(100, itemsHelper.getMaxHazardRadiationForLevel(campOrdinal, step, levelVO.isHard));
                } else {
                    return Math.min(100, itemsHelper.getMaxHazardPoisonForLevel(campOrdinal, step, levelVO.isHard));
                }
            }
            
            var setSectorHazard = function (sectorVO, hazardValueRand, isRadiation) {
                var maxHazardValue = getMaxValue(sectorVO, isRadiation, sectorVO.zone);
                var minHazardValue = Math.floor(Math.min(20, maxHazardValue / 3 * 2));
                var hazardValue = Math.ceil((minHazardValue + hazardValueRand * (maxHazardValue - minHazardValue)) / 5) * 5;
                if (hazardValue > maxHazardValue) hazardValue = maxHazardValue;
                if (isRadiation) {
                    sectorVO.hazards.radiation = hazardValue;
                } else {
                    sectorVO.hazards.poison = hazardValue;
                }
            };
            
            var makeCluster = function (centerSector, h, radius) {
                var isRadiation = WorldCreatorRandom.random(seed / 3381 + levelOrdinal * 777 + (h+44)*(h+11)) > 0.5;
                var hazardValueRand = WorldCreatorRandom.random(levelOrdinal * (h+11) / seed * 2 + seed/(h+99+levelOrdinal) - h*h);
                for (var hx = centerSector.position.sectorX - radius; hx <= centerSector.position.sectorX + radius; hx++) {
                    for (var hy = centerSector.position.sectorY - radius; hy <= centerSector.position.sectorY + radius; hy++) {
                        var sectorVO = levelVO.getSector(hx, hy);
                        if (!sectorVO) continue;
                        if (sectorVO.isCamp) continue;
                        if (WorldCreatorConstants.isEarlierZone(sectorVO.zone, centerSector.zone)) continue;
                        setSectorHazard(sectorVO, hazardValueRand, isRadiation);
                    }
                }
            }
            
            if (!(isPollutedLevel || isRadiatedLevel)) {
                // normal level
                // - random clusters
                var maxNumHazardClusters = Math.round(Math.min(4, levelVO.sectors.length / 100));
                var options = { excludingFeature: "camp", excludedZones: [ WorldConstants.ZONE_PASSAGE_TO_CAMP ] };
                var hazardSectors = WorldCreatorRandom.randomSectors(seed / 3 * levelOrdinal + 73 * levelVO.maxX, worldVO, levelVO, 0, maxNumHazardClusters, options);
                for (var h = 0; h < hazardSectors.length; h++) {
                    var centerSector = hazardSectors[h];
                    var hrRandom = WorldCreatorRandom.random(84848 + levelOrdinal * 99 + (h+12) * 111 + seed / 777);
                    var radius = Math.round(hrRandom * 7) + 2;
                    makeCluster(centerSector, h, radius);
                }
                
                // - zone ZONE_EXTRA (only on campable levels as on on-campable ones ZONE_EXTRA is most of the level)
                if (levelVO.isCampable) {
                    var isRadiation = levelOrdinal >= WorldCreatorConstants.MIN_LEVEL_ORDINAL_HAZARD_RADIATION && WorldCreatorRandom.randomBool(seed / 3385 + levelOrdinal * 7799);
                    for (var i = 0; i < levelVO.sectors.length; i++) {
                        var sectorVO = levelVO.sectors[i];
                        if (sectorVO.zone != WorldConstants.ZONE_EXTRA_CAMPABLE) continue;
                        setSectorHazard(sectorVO, 1, isRadiation);
                        
                    }
                }
                // - clusters on border sectors (to guide player to camp)
                var freq = 0.75;
                var borderSectors = WorldCreatorHelper.getBorderSectorsForZone(levelVO, WorldConstants.ZONE_PASSAGE_TO_CAMP, true);
                for (var i = 0; i < borderSectors.length; i++) {
                    var pair = borderSectors[i];
                    var distanceToCamp = Math.min(
                        WorldCreatorHelper.getDistanceToCamp(worldVO, levelVO, pair.sector),
                        WorldCreatorHelper.getDistanceToCamp(worldVO, levelVO, pair.neighbour)
                    );
                    if (distanceToCamp > 2) {
                        var s = 2000 + seed % 26 * 3331 + 100 + (i + 5) * 6541 + distanceToCamp * 11;
                        var add = WorldCreatorRandom.randomBool(s);
                        if (add) {
                            var radius = WorldCreatorRandom.randomInt(s / 2, 1, 3);
                            makeCluster(pair.sector, i, radius);
                        }
                    }
                }
            } else {
                // level completely covered in hazard
                var isRadiation = isRadiatedLevel;
                for (var i = 0; i < levelVO.sectors.length; i++) {
                    var sectorVO = levelVO.sectors[i];
                    if (sectorVO.zone == WorldConstants.ZONE_ENTRANCE) continue;
                    var maxHazardValue = getMaxValue(sectorVO, isRadiation, sectorVO.zone);
                    var minHazardValue = Math.floor(maxHazardValue / 2);
                    if (levelVO.isHard) minHazardValue = maxHazardValue;
                    var hazardValueRand = WorldCreatorRandom.random(levelOrdinal * (i + 11) / seed * 55 + seed / (i + 99) - i * i);
                    var hazardValue = Math.ceil((minHazardValue + hazardValueRand * (maxHazardValue - minHazardValue)) / 5) * 5;
                    if (hazardValue > maxHazardValue) hazardValue = maxHazardValue;
                    if (isPollutedLevel) {
                        sectorVO.hazards.poison = hazardValue;
                    } else if (isRadiatedLevel) {
                        sectorVO.hazards.radiation = hazardValue;
                    }
                }
            }
        },
        
        generateMovementBlockers: function (seed, worldVO, levelVO) {
            var l = levelVO.level;
			var levelOrdinal = WorldCreatorHelper.getLevelOrdinal(seed, l);
            var campOrdinal = WorldCreatorHelper.getCampOrdinal(seed, l);
                        
            var blockerTypes = this.getLevelBlockerTypes(levelVO);
            if (blockerTypes.length < 1) return;
            
            var creator = this;
            var getBlockerType = function (seed) {
                var typeix = blockerTypes.length > 1 ? WorldCreatorRandom.randomInt(seed, 0, blockerTypes.length) : 0;
                return blockerTypes[typeix];
            };
            var addBlocker = function (seed, sectorVO, neighbourVO, addDiagonals, allowedCriticalPaths) {
                if (!neighbourVO) neighbourVO = WorldCreatorRandom.getRandomSectorNeighbour(seed, levelVO, sectorVO, true);
                var blockerType = getBlockerType(seed);
                creator.addMovementBlocker(worldVO, levelVO, sectorVO, neighbourVO, blockerType, { addDiagonals: addDiagonals, allowedCriticalPaths: allowedCriticalPaths });
            };

            var addBlockersBetween = function (seed, levelVO, pointA, pointB, maxPaths, allowedCriticalPaths) {
                var path;
                var index;
                for (var i = 0; i < maxPaths; i++) {
                    path = WorldCreatorRandom.findPath(worldVO, pointA, pointB, true, true);
                    if (!path || path.length < 3) {
                        break;
                    }
                    var min = Math.round(path.length / 2);
                    var max = Math.max(min, path.length - 2);
                    var finalSeed = Math.abs(seed + 6700 - (i+1) * 555);
                    index = WorldCreatorRandom.randomInt(finalSeed, min, max);
                    var sectorVO = levelVO.getSector(path[index].sectorX, path[index].sectorY);
                    var neighbourVO = levelVO.getSector(path[index + 1].sectorX, path[index + 1].sectorY);
                    addBlocker(finalSeed, sectorVO, neighbourVO, true, allowedCriticalPaths);
                }
            };
            
            // critical paths: between passages on certain levels
            var numBetweenPassages = 0;
            if (l === 14) numBetweenPassages = 5;
            if (!levelVO.isCampable && campOrdinal == 7) numBetweenPassages = 5;
            if (numBetweenPassages > 0) {
                var allowedCriticalPaths = [ WorldCreatorConstants.CRITICAL_PATH_TYPE_PASSAGE_TO_PASSAGE ];
                for (var i = 0; i < levelVO.passagePositions.length; i++) {
                    for (var j = i + 1; j < levelVO.passagePositions.length; j++) {
                        var rand = Math.round(2222 + seed + (i+21) * 41 + (j + 2) * 33);
                        addBlockersBetween(rand, levelVO, levelVO.passagePositions[i], levelVO.passagePositions[j], numBetweenPassages, allowedCriticalPaths);
                    }
                }
            }
            
            // campable levels: zone borders
            if (levelVO.isCampable) {
                var freq = 0.25;
                // - from ZONE_PASSAGE_TO_CAMP to other (to lead player towards camp)
                var allowedCriticalPaths = [ WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_1, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_2, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE ];
                var borderSectors1 = WorldCreatorHelper.getBorderSectorsForZone(levelVO, WorldConstants.ZONE_PASSAGE_TO_CAMP, true);
                for (var i = 0; i < borderSectors1.length; i++) {
                    var pair = borderSectors1[i];
                    var distanceToCamp = Math.min(
                        WorldCreatorHelper.getDistanceToCamp(worldVO, levelVO, pair.sector),
                        WorldCreatorHelper.getDistanceToCamp(worldVO, levelVO, pair.neighbour)
                    );
                    if (distanceToCamp > 3) {
                        var s =  seed % 26 * 3331 + 100 + (i + 5) * 654;
                        if (WorldCreatorRandom.random(s) < freq) {
                            addBlocker(s * 2, pair.sector, pair.neighbour, true, allowedCriticalPaths);
                        }
                    }
                }
            }
            
            // campable levels: block all paths to one POI
            // TODO check that that POI is in a different direction than first passage of the level, otherwise the movement blockers will just get blocked because blockers on zone ZONE_PASSAGE_TO_CAMP are not allowed
            if (levelVO.isCampable && WorldCreatorRandom.randomBool(seed % 888 + l * 777, 0.75)) {
                var localeSectors = levelVO.localeSectors;
                var rand = seed % 333 + 1000 + l * 652;
                var i = WorldCreatorRandom.randomInt(rand, 0, localeSectors.length);
                var poiSector = localeSectors[i];
                var campPos = levelVO.campPositions[0];
                var allowedCriticalPaths = [ WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_1, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_2, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE ];
                addBlockersBetween(rand, levelVO, campPos, poiSector.position, 3, allowedCriticalPaths);
            }

            // random ones
            var numRandom = 1;
            if (l === 14) numRandom = 2;
            if (l === worldVO.topLevel - 1) numRandom = 4;
            if (l === worldVO.topLevel) numRandom = 8;
            if (numRandom > 0) {
                var randomSeed = seed % 8 * 1751 + 1000 + (l + 5) * 291;
                var options = { excludingFeature: "camp" };
                var sectors = WorldCreatorRandom.randomSectors(randomSeed, worldVO, levelVO, numRandom, numRandom + 1, options);
                for (var i = 0; i < sectors.length; i++) {
                    var addDiagonals = (l + i + 9) % 3 !== 0;
                    addBlocker(randomSeed - (i + 1) * 321, sectors[i], null, addDiagonals);
                }
            }
        },
        
        generatePaths: function (seed, worldVO, levelVO) {
            var result = [];
            var unvisitedSectors = [];
            var visitSector = function (pos, pathID) {
                var posSector = levelVO.getSector(pos);
                if (!posSector) return;
                if (posSector.pathID && pos.pathID != 0) return;
                var index = unvisitedSectors.indexOf(posSector);
                if (index < 0) return;
                posSector.pathID = pathID;
                unvisitedSectors.splice(index, 1);
            };
            var traverseSectors = function (startPos, sectors, pathStage) {
                var traverse = [];
                if (sectors.length <= 0) return;
                unvisitedSectors = sectors.concat();
                var currentPos = startPos;
                var pathID = 0;
                var i = 0;
                while (unvisitedSectors.length > 0) {
                    visitSector(currentPos, pathID);
                    var sectorsByDistance = unvisitedSectors.slice(0).sort(WorldCreatorHelper.sortSectorsByDistanceTo(currentPos));
                    var nextSector = sectorsByDistance[0];
                    var path = WorldCreatorRandom.findPath(worldVO, currentPos, nextSector.position, false, true, pathStage);
                    pathID =  result.length;
                    for (var j = 0; j < path.length; j++) {
                        var pathPos = path[j];
                        visitSector(pathPos, pathID);
                        traverse.push(pathPos);
                    }
                    currentPos = nextSector.position;
                    i++;
                }
                result.push(traverse);
            }
            var startPos = levelVO.excursionStartPosition;
            traverseSectors(startPos, levelVO.getSectorsByStage(WorldConstants.CAMP_STAGE_EARLY), WorldConstants.CAMP_STAGE_EARLY);
            traverseSectors(startPos, levelVO.getSectorsByStage(WorldConstants.CAMP_STAGE_LATE), null);
            return result;
        },
        
        generateStashes: function (seed, worldVO, levelVO, itemsHelper) {
            var l = levelVO.level;
            var lateZones = [ WorldConstants.ZONE_POI_2, WorldConstants.ZONE_EXTRA_CAMPABLE ];
            var earlyZones = [ WorldConstants.ZONE_PASSAGE_TO_CAMP, WorldConstants.ZONE_PASSAGE_TO_PASSAGE, WorldConstants.ZONE_POI_1 ];
            
            // TODO handle multiple stashes per sector (currently just overwrites)
            var addStashes = function (sectorSeed, reason, stashType, itemID, num, numItemsPerStash, excludedZones) {
                var options = { requireCentral: false, excludingFeature: "camp", excludedZones: excludedZones };
                var stashSectors = WorldCreatorRandom.randomSectors(sectorSeed, worldVO, levelVO, num, num + 1, options);
                for (var i = 0; i < stashSectors.length; i++) {
                    stashSectors[i].stashItem = itemID;
                    stashSectors[i].stash = new StashVO(stashType, numItemsPerStash, itemID);
                    // log.i("add stash level " + l + " [" + reason + "]: " + itemID + " " + stashSectors[i].position + " " + stashSectors[i].zone + " | " + (excludedZones ? excludedZones.join(",") : "-"))
                }
            };
            
            // stashes: lock picks
            if (l == 13) {
                addStashes(seed * l * 8 / 3 + (l+100)*14 + 3333, "lockpick", StashVO.STASH_TYPE_ITEM, "exploration_1", 1, 1, lateZones);
            }
            
            // stashes: hairpins (for lockpics)
            var pinsPerStash = 3;
            var numHairpinStashes = 2;
            if (l == 13) numHairpinStashes = 5;
            if (!levelVO.isCampable) numHairpinStashes = 5;
            addStashes(seed * l * 8 / 3 + (l+100)*14 + 3333, "hairpin", StashVO.STASH_TYPE_ITEM, "res_hairpin", numHairpinStashes, pinsPerStash);
            
            // stashes: ingredients for craftable equipment (campable levels)
            if (levelVO.isCampable) {
                var requiredEquipment = itemsHelper.getRequiredEquipment(levelVO.campOrdinal, WorldConstants.CAMP_STEP_END, levelVO.isHard);
                var requiredEquipmentIngredients = itemsHelper.getIngredientsToCraftMany(requiredEquipment);
                var numStashIngredients = MathUtils.clamp(Math.floor(requiredEquipmentIngredients.length / 2), 1, 3);
                for (var i = 0; i < numStashIngredients; i++) {
                    var def = requiredEquipmentIngredients[i];
                    var amount = MathUtils.clamp(def.amount / 3, 3, 10);
                    addStashes(seed % 13 + l * 7 + 5 + (i+1) * 10, "craftable ingredients", StashVO.STASH_TYPE_ITEM, def.id, 2, amount);
                }
            }
            
            // stashes: non-craftable equipment
            var newEquipment = itemsHelper.getNewEquipment(levelVO.campOrdinal);
            for (var i = 0; i < newEquipment.length; i++) {
                if (!newEquipment[i].craftable && newEquipment[i].scavengeRarity <= 5) {
                    addStashes(seed / 3 + (l+551)*8 + (i+103)*18, "non-craftable equipment", StashVO.STASH_TYPE_ITEM, newEquipment[i].id, 1, 1, lateZones);
                }
            }
            
            // stashes: random ingredients (uncampable levels)
            if (!levelVO.isCampable) {
                var i = seed % (l+5) + 3;
                var ingredient = ItemConstants.getIngredient(i);
                addStashes(seed % 7 + 3000 + 101 * l, "random", StashVO.STASH_TYPE_ITEM, ingredient.id, 2, 3);
            }
            
            // stashes: metal caches
            if (l == 13) {
                addStashes(seed / 3 * 338 + l * 402, "metal", StashVO.STASH_TYPE_ITEM, "cache_metal_1", 2, 1, lateZones);
                addStashes(seed / 5 * 931 + l * 442, "metal", StashVO.STASH_TYPE_ITEM, "cache_metal_2", 2, 1, lateZones);
            } else {
                if (l % 2 == 0)
                    addStashes(seed / 5 * 931 + l * 442, "metal", StashVO.STASH_TYPE_ITEM, "cache_metal_1", 1, 1);
                else
                    addStashes(seed / 5 * 931 + l * 442, "metal", StashVO.STASH_TYPE_ITEM, "cache_metal_2", 1, 1);
            }
            
            // TODO add currency stashes just for fun
            // TODO add rare and non-essential stuff no non-campable levels
        },
        
        generateWorksops: function (seed, worldVO, levelVO) {
            var workshopResource = null;
            if (levelVO.isCampable && levelVO.campOrdinal === WorldConstants.CAMP_ORDINAL_FUEL)
                workshopResource = "fuel";
            if (levelVO.level == worldVO.bottomLevel)
                workshopResource = "rubber";
            if (!workshopResource) return;
            
            var l = levelVO.level;
            var pathConstraints = [];
            for (var i = 0; i < levelVO.campPositions.length; i++) {
                var startPos = levelVO.campPositions[i];
                var maxLength = WorldCreatorConstants.getMaxPathLength(levelVO.campOrdinal, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_1);
                pathConstraints.push(new PathConstraintVO(startPos, maxLength, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_1));
            }
            var options = { excludingFeature: "camp", pathConstraints: pathConstraints };
            var workshopSectors = WorldCreatorRandom.randomSectors(seed * l * 2 / 7 * l, worldVO, levelVO, 1, 2, options);
            for (var i = 0; i < workshopSectors.length; i++) {
                workshopSectors[i].hasWorkshop = true;
                workshopSectors[i].workshopResource = resourceNames[workshopResource];
                for (var j = 0; j < pathConstraints.length; j++) {
                    WorldCreatorHelper.addCriticalPath(worldVO, workshopSectors[i].position, pathConstraints[j].startPosition, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_1);
                }
            }
        },
        
        generateRequiredResources: function (seed, worldVO, levelVO, path) {
            var bagSize =  ItemConstants.getBagBonus(levelVO.levelOrdinal);
            var maxStepsWater = Math.floor(bagSize / 2);
            var maxStepsFood = Math.floor(bagSize / 2 * 0.75);
            var stepsWater = 0;
            var stepsFood = 0;
            var requireResource = function (i, count, sectorVO, steps, maxSteps) {
                // end of path, probably a dead end and need supplies to return
                if (i == count - 1 && steps > 3)
                    return true;
                // not too often
                var minSteps = Math.floor(maxSteps * 0.75);
                if (steps < minSteps)
                    return false;
                // guarantee max steps regardless of hazard factor etc
                if (steps >= maxSteps)
                    return true;
                // probability
                var hazardFactor = (sectorVO.hazards.poison || sectorVO.hazards.radiation) ? 0.25 : 1;
                var probability = (steps - minSteps) / (maxSteps - minSteps) * hazardFactor;
                var s1 = 2000 + seed % 1000 * 2 + levelVO.level * 103 + i * 5;
                var r1 = WorldCreatorRandom.random(s1);
                return r1 < probability;
            };
            for (var i = 0; i < path.length; i++) {
                var pos = path[i];
                var sectorVO = levelVO.getSector(pos);
                if (requireResource(i, path.length, sectorVO, stepsWater, maxStepsWater)) {
                    sectorVO.requiredResources.water = true;
                    stepsWater = -1;
                }
                if (requireResource(9000 + i, path.length, sectorVO, stepsFood, maxStepsFood)) {
                    sectorVO.requiredResources.food = true;
                    stepsFood = -1;
                }
                stepsWater++;
                stepsFood++;
            }
        },
        
        getSectorType: function (seed, worldVO, levelVO, sectorVO) {
            var level = levelVO.level;
            var r1 = 9000 + seed % 2000 + (levelVO.level + 5) * 11 + sectorVO.position.sectorX * 141 + sectorVO.position.sectorY * 153;
            var rand = WorldCreatorRandom.random(r1);
            
			var sectorType = SectorConstants.SECTOR_TYPE_MAINTENANCE;
            if (level == worldVO.topLevel) {
                // special level: top level
                sectorType = SectorConstants.SECTOR_TYPE_COMMERCIAL;
				if (rand < 0.6) sectorType = SectorConstants.SECTOR_TYPE_PUBLIC;
				if (rand < 0.4) sectorType = SectorConstants.SECTOR_TYPE_RESIDENTIAL;
				if (rand < 0.05) sectorType = SectorConstants.SECTOR_TYPE_MAINTENANCE;
            } else if (level > worldVO.topLevel - 4) {
				// levels near top: mainly residentai
                sectorType = SectorConstants.SECTOR_TYPE_COMMERCIAL;
				if (rand < 0.7) sectorType = SectorConstants.SECTOR_TYPE_PUBLIC;
				if (rand < 0.5) sectorType = SectorConstants.SECTOR_TYPE_RESIDENTIAL;
				if (rand < 0.05) sectorType = SectorConstants.SECTOR_TYPE_MAINTENANCE;
			} else if (level > worldVO.topLevel - 8) {
				// first dark levels: mainly recent industrial and maintenance
				sectorType = SectorConstants.SECTOR_TYPE_INDUSTRIAL;
				if (rand < 0.7) sectorType = SectorConstants.SECTOR_TYPE_COMMERCIAL;
				if (rand < 0.65) sectorType = SectorConstants.SECTOR_TYPE_PUBLIC;
				if (rand < 0.5) sectorType = SectorConstants.SECTOR_TYPE_MAINTENANCE;
				if (rand < 0.4) sectorType = SectorConstants.SECTOR_TYPE_RESIDENTIAL;
				if (rand < 0.2) sectorType = SectorConstants.SECTOR_TYPE_SLUM;
			} else if (level > 14) {
				// levels baove 14: slums and maintenance
				sectorType = SectorConstants.SECTOR_TYPE_MAINTENANCE;
				if (rand < 0.75) sectorType = SectorConstants.SECTOR_TYPE_PUBLIC;
				if (rand < 0.7) sectorType = SectorConstants.SECTOR_TYPE_INDUSTRIAL;
				if (rand < 0.5) sectorType = SectorConstants.SECTOR_TYPE_RESIDENTIAL;
				if (rand < 0.4) sectorType = SectorConstants.SECTOR_TYPE_SLUM;
            } else if (level == 14) {
                // special level: 14
				sectorType = SectorConstants.SECTOR_TYPE_INDUSTRIAL;
				if (rand < 0.25) sectorType = SectorConstants.SECTOR_TYPE_MAINTENANCE;
				if (rand < 0.35) sectorType = SectorConstants.SECTOR_TYPE_SLUM;
            } else if (level > 4) {
				// levels below 14: mix of slum, maintenance, and everything else
				sectorType = SectorConstants.SECTOR_TYPE_SLUM;
				if (rand < 0.5) sectorType = SectorConstants.SECTOR_TYPE_INDUSTRIAL;
				if (rand < 0.4) sectorType = SectorConstants.SECTOR_TYPE_MAINTENANCE;
				if (rand < 0.3) sectorType = SectorConstants.SECTOR_TYPE_RESIDENTIAL;
				if (rand < 0.2) sectorType = SectorConstants.SECTOR_TYPE_COMMERCIAL;
				if (rand < 0.1) sectorType = SectorConstants.SECTOR_TYPE_PUBLIC;
            } else if (level > worldVO.bottomLevel) {
                // levels near ground: old levels
				sectorType = SectorConstants.SECTOR_TYPE_SLUM;
				if (rand < 0.9) sectorType = SectorConstants.SECTOR_TYPE_INDUSTRIAL;
				if (rand < 0.8) sectorType = SectorConstants.SECTOR_TYPE_MAINTENANCE;
				if (rand < 0.6) sectorType = SectorConstants.SECTOR_TYPE_RESIDENTIAL;
				if (rand < 0.4) sectorType = SectorConstants.SECTOR_TYPE_COMMERCIAL;
				if (rand < 0.2) sectorType = SectorConstants.SECTOR_TYPE_PUBLIC;
            } else if (level == worldVO.bottomLevel) {
                // special level: ground level
				sectorType = SectorConstants.SECTOR_TYPE_MAINTENANCE;
				if (rand < 0.8) sectorType = SectorConstants.SECTOR_TYPE_INDUSTRIAL;
				if (rand < 0.6) sectorType = SectorConstants.SECTOR_TYPE_RESIDENTIAL;
				if (rand < 0.4) sectorType = SectorConstants.SECTOR_TYPE_COMMERCIAL;
				if (rand < 0.2) sectorType = SectorConstants.SECTOR_TYPE_PUBLIC;
			}
            
            return sectorType;
        },
        
        isSunlit: function (seed, worldVO, levelVO, sectorVO) {
            var l = sectorVO.position.level;
            var isHole = function (pos) {
                var features = worldVO.getFeaturesByPos(pos);
                for (var i = 0; i < features.length; i++) {
                    switch (features[i].type) {
                        case WorldCreatorConstants.FEATURE_HOLE_WELL:
                        case WorldCreatorConstants.FEATURE_HOLE_COLLAPSE:
                        case WorldCreatorConstants.FEATURE_HOLE_SEA:
                        case WorldCreatorConstants.FEATURE_HOLE_MOUNTAIN:
                            return 1;
                    }
                }
                return 0;
            };
            if (l === worldVO.topLevel) {
                // surface: all lit
                return 1;
            } else if (l === 13) {
                // start level: no sunlight
                return 0;
            } else {
                // others: sunlight only if ceiling or edge is open
                // - sector itself is a hole
                if (isHole(sectorVO.position)) return 1;
                // - sector(s) above are holes or damaged enough
                for (var level = l + 1; l <= worldVO.topLevel; l++) {
                    var pos = new PositionVO(level, sectorVO.position.sectorX, sectorVO.position.sectorY);
                    var sectorVO2 = worldVO.getLevel(l).getSector(pos.sectorX, pos.sectorY, 5);
                    if (isHole(pos)) return 1;
                    if (!sectorVO2 || (sectorVO.wear < 8 && sectorVO.damage < 5)) break;
                    if (sectorVO2 && sectorVO2.sunlit) return 1;
                }
                // - sector is near edge to the sea
                var sea = worldVO.getFeaturesByType(WorldCreatorConstants.FEATURE_HOLE_SEA)[0];
                var distance = sea.getDistanceTo(sectorVO.position);
                if (distance <= 1 + levelVO.seaPadding) return 1;
                return 0;
            }
        },
        
        getPassageUpType: function (seed, worldVO, levelVO, sectorVO) {
            if (!sectorVO.isPassageUp) return null;
            var sectorUp  = worldVO.getLevel(levelVO.level + 1).getSector(sectorVO.position.sectorX, sectorVO.position.sectorY);
            return sectorUp.passageDownType;
        },
        
        getPassageDownType: function (seed, worldVO, levelVO, sectorVO) {
            if (!sectorVO.isPassageDown) return null;
            var l = levelVO.level;
            var s1 = seed + l * 7 + sectorVO.position.sectorX * seed % 6 * 10;
            var campOrdinal = levelVO.campOrdinal;
            var unlockElevatorOrdinal = UpgradeConstants.getMinimumCampOrdinalForUpgrade("unlock_building_passage_elevator");
            if (l === 13) {
                return MovementConstants.PASSAGE_TYPE_STAIRWELL;
            } else if (campOrdinal > WorldConstants.CAMP_ORDINAL_LIMIT) {
                return MovementConstants.PASSAGE_TYPE_BLOCKED;
            } else if (l === 14) {
                return MovementConstants.PASSAGE_TYPE_HOLE;
            } else if (levelVO.isCampable && campOrdinal == unlockElevatorOrdinal) {
                return MovementConstants.PASSAGE_TYPE_ELEVATOR;
            } else {
                var availablePassageTypes = [MovementConstants.PASSAGE_TYPE_STAIRWELL];
                if (campOrdinal >= unlockElevatorOrdinal)
                    availablePassageTypes.push(MovementConstants.PASSAGE_TYPE_ELEVATOR);
                if (l > 14)
                    availablePassageTypes.push(MovementConstants.PASSAGE_TYPE_HOLE);
                var passageTypeIndex = WorldCreatorRandom.randomInt(s1, 0, availablePassageTypes.length);
                var passageType = availablePassageTypes[passageTypeIndex];
                return passageType;
            }
        },
        
        generateTexture: function (seed, worldVO, levelVO, sectorVO) {
            var l = sectorVO.position.level;
            var x = sectorVO.position.sectorX;
            var y = sectorVO.position.sectorY;
            var features = worldVO.getFeaturesByPos(sectorVO.position);
            var surroundingFeatures = WorldCreatorHelper.getFeaturesSurrounding(worldVO, levelVO, sectorVO.position);

            // wear
            var levelWear = MathUtils.clamp((worldVO.topLevel - l) / (worldVO.topLevel - 5) * 8, 0, 10);
            var wear = levelWear + WorldCreatorRandom.randomInt(seed * l + (x + 100) * 82 + (y + 100) * 82, -3, 3);
            if (sectorVO.isCamp) wear = Math.min(3, wear);
            sectorVO.wear = MathUtils.clamp(Math.round(wear), 0, 10);

            // damage
            var damage = 0;
            var getFeatureDamage = function (feature) {
                switch (feature.type) {
                    case WorldCreatorConstants.FEATURE_HOLE_WELL: return 1;
                    case WorldCreatorConstants.FEATURE_HOLE_COLLAPSE: return 8;
                    case WorldCreatorConstants.FEATURE_HOLE_SEA: return 3;
                    default: return 0;
                }
            }
            for (var i = 0; i < features.length; i++) {
                damage = Math.max(damage, getFeatureDamage(features[i]));
            }
            for (var i = 0; i < surroundingFeatures.length; i++) {
                var d = surroundingFeatures[i].getDistanceTo(sectorVO.position);
                damage = Math.max(damage, getFeatureDamage(surroundingFeatures[i]) - d * 2);
            }
            if (sectorVO.isCamp) damage = Math.min(3, damage);
            if (l == 14) damage = Math.max(3, damage);
            sectorVO.damage = MathUtils.clamp(Math.round(damage), 0, 10);

            // building density
            var levelDensity = MathUtils.clamp(WorldCreatorRandom.random(seed * 7 * l / 3 + 62) * 10, 2, 9);
            if (l == worldVO.topLevel) levelDensity = 5;
            if (l == worldVO.topLevel - 1) levelDensity = 5;
            if (l == worldVO.topLevel - 2) levelDensity = 7;
            if (l == worldVO.topLevel - 3) levelDensity = 8;
            if (l == 14) levelDensity = 8;
            if (l == worldVO.bottomLevel + 1) levelDensity = 6;
            if (l == worldVO.bottomLevel) levelDensity = 3;
            
            var minDensity = 0;
            var maxDensity = 10;
            switch (sectorVO.sectorType) {
                case SectorConstants.SECTOR_TYPE_RESIDENTIAL:
                    minDensity = 2;
                    maxDensity = 8;
                    break;
                case SectorConstants.SECTOR_TYPE_INDUSTRIAL:
                    minDensity = 1;
                    maxDensity = 10;
                    break;
                case SectorConstants.SECTOR_TYPE_MAINTENANCE:
                    minDensity = 2;
                    maxDensity = 10;
                    break;
                case SectorConstants.SECTOR_TYPE_COMMERCIAL:
                    minDensity = 1;
                    maxDensity = 10;
                    break;
                case SectorConstants.SECTOR_TYPE_PUBLIC:
                    minDensity = 0;
                    maxDensity = 7;
                    break;
                case SectorConstants.SECTOR_TYPE_SLUM:
                    minDensity = 3;
                    maxDensity = 10;
                    break;
            }
            
            var randomDensity = WorldCreatorRandom.randomInt(seed * l * x + y + x, minDensity, maxDensity + 1);
            if (sectorVO.isCamp) randomDensity = 5;
            
            var density = (levelDensity + randomDensity) / 2;
            sectorVO.buildingDensity = MathUtils.clamp(Math.round(density), minDensity, maxDensity);
        },
        
        generateResources: function (seed, worldVO, levelVO, sectorVO) {
            var l = sectorVO.position.level;
            var x = sectorVO.position.sectorX;
            var y = sectorVO.position.sectorY;
            var ll = levelVO.level === 0 ? levelVO.level : 50;
            var sectorType = sectorVO.sectorType;
			var campOrdinal = levelVO.campOrdinal;
            
            // scavengeable resources
            var sRandom = (x * 22 + y * 3000);
            var sectorAbundanceFactor = WorldCreatorRandom.random(seed * sRandom + (x + 99) * 7 * (y - 888));
            var waterRandomPart = WorldCreatorRandom.random(seed * (l + 1000) * (x + y + 900) + 10134) * Math.abs(5 - sectorVO.wear) / 5;
            var sca = new ResourcesVO();
            switch (sectorType) {
                case SectorConstants.SECTOR_TYPE_RESIDENTIAL:
                    sca.metal = 3;
                    sca.food = WorldCreatorRandom.random(seed + l * x * y * 24 + x * 33 + 6) < 0.60 ? Math.round(sectorAbundanceFactor * 5 + sectorVO.wear / 2) : 0;
                    sca.water = waterRandomPart > 0.82 ? 2 : 0;
                    sca.rope = WorldCreatorRandom.random(seed + l * x / y * 44 + 6) > 0.95 ? 1 : 0;
                    sca.medicine = campOrdinal > 2 && WorldCreatorRandom.random(seed / (l + 5) + x * x * y + 66) > 0.99 ? 1 : 0;
                    break;
                case SectorConstants.SECTOR_TYPE_INDUSTRIAL:
                    sca.water = waterRandomPart > 0.9 ? 1 : 0;
                    sca.metal = 8;
                    sca.tools = (l > 13) ? WorldCreatorRandom.random(seed + l * x / y * 44 + 6) > 0.95 ? 1 : 0 : 0;
                    sca.rope = WorldCreatorRandom.random(seed + l * x / y * 44 + 6) > 0.90 ? 1 : 0;
                    sca.fuel = WorldCreatorRandom.random(seed / (l + 5) + x * x * y + 66) > 0.90 ? 1 : 0;
                    sca.rubber = WorldCreatorRandom.random(seed / x * ll + x * y * 16) > 0.90 ? 1 : 0;
                    break;
                case SectorConstants.SECTOR_TYPE_MAINTENANCE:
                    sca.metal = 10;
                    sca.rope = WorldCreatorRandom.random(seed + l * x / y * 44 + 6) > 0.90 ? 1 : 0;
                    sca.fuel = WorldCreatorRandom.random(seed / (l + 5) + x * x * y + 66) > 0.90 ? 1 : 0;
                    sca.tools = (l > 13) ? WorldCreatorRandom.random(seed + l * x / y * 44 + 6) > 0.90 ? 1 : 0 : 0;
                    break;
                case SectorConstants.SECTOR_TYPE_COMMERCIAL:
                    sca.water = waterRandomPart > 0.85 ? 2 : 0;
                    sca.metal = 2;
                    sca.food = Math.round(sectorAbundanceFactor * 10);
                    sca.medicine = campOrdinal > 2 && WorldCreatorRandom.random(seed / (l + 5) + x * x * y + 66) > 0.99 ? 1 : 0;
                    break;
                case SectorConstants.SECTOR_TYPE_SLUM:
                    sca.metal = 7;
                    sca.food = WorldCreatorRandom.random(seed / (l+10) + x * y * 63) < 0.2 ? Math.round(sectorAbundanceFactor * 5 + sectorVO.wear / 2) : 0;
                    sca.water = waterRandomPart > 0.75 ? 1 : 0;
                    sca.rope = WorldCreatorRandom.random(seed + l * x / y * 44 + 6) > 0.85 ? 1 : 0;
                    sca.fuel = WorldCreatorRandom.random(seed / (l + 5) + x * x * y + 66) > 0.95 ? 1 : 0;
                    break;
            }
            
            // collectable resources
            var col = new ResourcesVO();
            var sectorCentralness = (10 - (Math.abs(x) / 10) + 10 - (Math.abs(y) / 10)) / 2;
            var sectorNatureFactor = (WorldCreatorRandom.random(seed + (x + 1453) / 55 * (y - 455)) * (sectorVO.wear)) / 10;
            var sectorWaterFactor = (WorldCreatorRandom.random(seed / (x + 30) + (y + 102214)) * (sectorCentralness + 10)) / 25;
            
            switch (sectorType) {
                case SectorConstants.SECTOR_TYPE_RESIDENTIAL:
                case SectorConstants.SECTOR_TYPE_COMMERCIAL:
                    col.food = sectorNatureFactor > 0.2 ? Math.round(sectorNatureFactor * 10) : 0;
                    col.water = sectorWaterFactor > 0.75 ? Math.round(Math.min(10, sectorWaterFactor * 10)) : 0;
                    break;
                case SectorConstants.SECTOR_TYPE_INDUSTRIAL:
                case SectorConstants.SECTOR_TYPE_MAINTENANCE:
                    col.food = sectorNatureFactor > 0.4 ? Math.round(sectorNatureFactor * 8) : 0;
                    col.water = sectorWaterFactor > 0.95 ? Math.round(Math.min(10, sectorWaterFactor * 11)) : 0;
                    break;
                case SectorConstants.SECTOR_TYPE_SLUM:
                    col.food = sectorNatureFactor > 0.1 ? Math.round(sectorNatureFactor * 10) : 0;
                    col.water = sectorWaterFactor > 0.9 ? Math.round(Math.min(10, sectorWaterFactor * 8)) : 0;
                    break;
            }
            
            // define springs
            if (col.water > 0 || sca.water > 0) {
                sectorVO.hasSpring =  WorldCreatorRandom.random(7777 + seed % 987 + ll * 7 + y * 71) < 0.25;
            } else {
                sectorVO.hasSpring = false;
            }
            
            // add workshop resources to scavengeable
            if (sectorVO.workshopResource) {
                sca[sectorVO.workshopResource] = Math.max(sca[sectorVO.workshopResource], 3);
            }
            
            // adjustments for special levels
            if (l === worldVO.bottomLevel) {
                col.food = col.food > 0 ? col.food + 2 : 0;
                col.water = col.water > 0 ? col.water + 3 : 0;
                sca.herbs = WorldCreatorRandom.random(seed * l / x + y * 423) * (10 - sectorVO.wear);
            }
            
            if (l === worldVO.bottomLevel + 1) {
                col.food = col.food > 0 ? col.food + 1 : 0;
                col.water = col.water > 0 ? col.water + 1 : 0;
                sca.herbs = WorldCreatorRandom.random(seed * l / x + y * 423) * (10 - sectorVO.wear) / 2;
            }
            
            // adjustments for sector features
            if (sectorVO.sunlit) {
                sca.herbs = WorldCreatorRandom.random(seed * l / x + y * 423) > 0.75 ? 2 : 0;
            }

            if (sectorVO.hazards.poison > 0 || sectorVO.hazards.radiation > 0) {
                col.water = 0;
                col.food = 0;
            }
            
            // adjustments for required resources
            if (sectorVO.requiredResources) {
                if (sectorVO.requiredResources.getResource("water") > 0) {
                    col.water = Math.max(col.water, 3);
                }
                if (sectorVO.requiredResources.getResource("food") > 0) {
                    sca.food = Math.max(sca.food, 3);
                }
            }
            
            // adjustments for possible ranges
            sca.food = sca.food > 2 ? sca.food : 0;
            sca.herbs = sca.herbs > 2 ? Math.min(sca.herbs, 10) : 0;
            
            sectorVO.resourcesScavengable = sca;
            sectorVO.resourcesCollectable = col;
            sectorVO.resourcesAll = sca.clone();
            sectorVO.resourcesAll.addAll(col);
        },
        
        generateEnemies: function (seed, worldVO, levelVO, enemyCreator) {
            var l = levelVO.level;
            var creator = this;
            var randomGangFreq = 45;
                
            var blockerType = MovementConstants.BLOCKER_TYPE_GANG;
            
            var addGang = function (sectorVO, neighbourVO, addDiagonals, force) {
                if (!neighbourVO) neighbourVO = WorldCreatorRandom.getRandomSectorNeighbour(seed, levelVO, sectorVO, true);
                if (force || (WorldCreatorHelper.canHaveGang(sectorVO) && WorldCreatorHelper.canHaveGang(neighbourVO))) {
                    var blockerSettings = { addDiagonals: addDiagonals };
                    // callback is called twice, once for each sector
                    creator.addMovementBlocker(worldVO, levelVO, sectorVO, neighbourVO, blockerType, blockerSettings, function (s, direction) {
                        s.numLocaleEnemies[LocaleConstants.getPassageLocaleId(direction)] = 3;
                    }, function () {
                        var possibleEnemies = sectorVO.possibleEnemies.concat(neighbourVO.possibleEnemies);
                        possibleEnemies.sort(function (a, b) {
                            var diff1 = EnemyConstants.enemyDifficulties[a.id];
                            var diff2 = EnemyConstants.enemyDifficulties[b.id];
                            return diff2 - diff1;
                        });
                        var pos1 = sectorVO.position;
                        var pos2 = neighbourVO.position;
                        var gang = new GangVO(pos1, pos2, possibleEnemies[0]);
                        levelVO.addGang(gang);
                    });
                    return true;
                } else {
                    log.w("Skipped adding gang at " + sectorVO.position);
                    return false;
                }
            };

            var addGangs = function (seed, reason, levelVO, pointA, pointB, maxPaths) {
                var num = 0;
                var path;
                var index;
                for (var i = 0; i < maxPaths; i++) {
                    path = WorldCreatorRandom.findPath(worldVO, pointA, pointB, true, true);
                    if (!path || path.length < 3) break;
                    var min = Math.round(path.length / 4) + 1;
                    var max = path.length - 2;
                    var finalSeed = Math.abs(seed + (i+1) * 231);
                    index = WorldCreatorRandom.randomInt(finalSeed, min, max);
                    var sectorVO = levelVO.getSector(path[index].sectorX, path[index].sectorY);
                    var neighbourVO = levelVO.getSector(path[index + 1].sectorX, path[index + 1].sectorY);
                    if (!WorldCreatorHelper.canHaveGang(sectorVO)) continue;
                    if (!WorldCreatorHelper.canHaveGang(neighbourVO)) continue;
                    if (addGang(sectorVO, neighbourVO, false)) num++;
                }
                return num;
            };
            
            // sector-based: possible enemies, random encounters and locales
            for (var i = 0; i < levelVO.sectors.length; i++) {
                var sectorVO = levelVO.sectors[i];
                sectorVO.possibleEnemies = [];
                sectorVO.hasRegularEnemies = 0;

                // possible enemy definitions
                sectorVO.possibleEnemies = this.getPossibleEnemies(seed, worldVO, levelVO, sectorVO, enemyCreator);

                // regular enemies (random encounters not tied to locales / gangs)
                sectorVO.hasRegularEnemies = !sectorVO.isCamp && WorldCreatorRandom.random(l * sectorVO.position.sectorX * seed + sectorVO.position.sectorY * seed + 4848) > 0.2;

                // workshop and locale enemies (counts)
                if (sectorVO.hasWorkshop) {
                    sectorVO.numLocaleEnemies[LocaleConstants.LOCALE_ID_WORKSHOP] = 3;
                }
			}
                
            // gangs: on zone borders
            // - ZONE_PASSAGE_TO_CAMP: all except too close to camp
            var borderSectors = WorldCreatorHelper.getBorderSectorsForZone(levelVO, WorldConstants.ZONE_PASSAGE_TO_CAMP, true);
            for (var i = 0; i < borderSectors.length; i++) {
                var pair = borderSectors[i];
                var distanceToCamp = Math.min(
                    WorldCreatorHelper.getDistanceToCamp(this.world, levelVO, pair.sector),
                    WorldCreatorHelper.getDistanceToCamp(this.world, levelVO, pair.neighbour)
                );
                var distanceToCampThreshold = l == 13 ? 4 : 2;
                if (distanceToCamp > distanceToCampThreshold) {
                    addGang(pair.sector, pair.neighbour, true, true);
                }
            }
                
            // - ZONE_PASSAGE_TO_PASSAGE: most
            var isGoingDown = l <= 13 && l >= worldVO.bottomLevel;
            var passageUp = levelVO.passageUpSector;
            var passageDown = levelVO.passageDownSector;
            var passage1 = isGoingDown ? passageUp : passageDown;
            var passage2 = isGoingDown ? passageDown : passageUp;
            if (passage2) {
                borderSectors = WorldCreatorHelper.getBorderSectorsForZone(levelVO, WorldConstants.ZONE_PASSAGE_TO_PASSAGE, false);
                for (var i = 0; i < borderSectors.length; i++) {
                    // sector: z_extra, neighbour: z_p2p - if distance from sector is longer than from neighbour, add blocker
                    var pair = borderSectors[i];
                    var distance1 = WorldCreatorRandom.findPath(worldVO, pair.sector.position, passage2.position, false, true).length;
                    var distance2 = WorldCreatorRandom.findPath(worldVO, pair.neighbour.position, passage2.position, false, true).length;
                    if (distance1 > distance2) {
                        addGang(pair.sector, pair.neighbour, true, true);
                    }
                }
            }
                
            // gangs: critical paths
            var numLocales = 0;
            for (var s = 0; s < levelVO.campPositions.length; s++) {
                var campPos = levelVO.campPositions[s];
                for (var i = 0; i < levelVO.sectors.length; i++) {
                    var sectorVO = levelVO.sectors[i];
                    if (sectorVO.hasWorkshop) {
                        // camps to workshops (all paths)
                        var rand = Math.round(1000 + seed + (l+21) * 11 + (s + 2) * 31 + (i + 1) * 51);
                        addGangs(rand, "workshop", levelVO, campPos, sectorVO.position, 100);
                    } else if (sectorVO.locales.length > 0) {
                        // camps to locales (some paths)
                        var rand = Math.round(50 + seed + (l+11) * 11 + (s + 41) * 3 + (i + 1) * 42);
                        if (numLocales % 2 === 0) {
                            addGangs(rand, "locale", levelVO, campPos, sectorVO.position, 1);
                        }
                        numLocales++;
                    }
                }
            }

            // gangs: some random gangs regardless of camps
            var randomGangIndex = 0;
            for (var i = 0; i < levelVO.sectors.length; i++) {
                var sectorVO = levelVO.sectors[i];
                if (!WorldCreatorHelper.canHaveGang(sectorVO)) continue;
                if (randomGangIndex >= randomGangFreq) {
                    var neighbourVO = WorldCreatorRandom.getRandomSectorNeighbour(seed, levelVO, sectorVO, true);
                    if (!WorldCreatorHelper.canHaveGang(neighbourVO)) continue;
                    var direction = PositionConstants.getDirectionFrom(sectorVO.position, neighbourVO.position);
                    if (!sectorVO.movementBlockers[direction]) {
                        var addDiagonals = i % (randomGangFreq * 2) === 0;
                        addGang(sectorVO, neighbourVO, addDiagonals);
                        randomGangIndex = 0;
                    }
                }

                randomGangIndex++;
            }
        },
        
        generateLocales: function (seed, worldVO, levelVO) {
            var l = levelVO.level;
			var campOrdinal = WorldCreatorHelper.getCampOrdinal(seed, levelVO.level);
                        
            var addLocale = function (sectorVO, locale) {
                sectorVO.locales.push(locale);
                levelVO.localeSectors.push(sectorVO);
                levelVO.numLocales++;
            };
            
            // 1) spawn trading partners
            for (var i = 0; i < TradeConstants.TRADING_PARTNERS.length; i++) {
                var partner = TradeConstants.TRADING_PARTNERS[i];
                var levelOrdinal = WorldCreatorHelper.getLevelOrdinalForCampOrdinal(seed, partner.campOrdinal);
                var level = WorldCreatorHelper.getLevelForOrdinal(seed, levelOrdinal);
                if (level == levelVO.level) {
                    var sectorVO = WorldCreatorRandom.randomSector(seed - 9393 + i * i, worldVO, levelVO, false);
                    var locale = new LocaleVO(localeTypes.tradingpartner, true, false);
                    // log.i("trade partner at " + sectorVO.position)
                    addLocale(sectorVO, locale);
                }
            }
            
            // 2) spanw grove
            if (levelVO.level == worldVO.bottomLevel) {
                var groveSector = WorldCreatorRandom.randomSector(seed, worldVO, levelVO, true);
                var groveLocale = new LocaleVO(localeTypes.grove, true, false);
                groveSector.sunlit = 1;
                addLocale(groveSector, groveLocale);
            }

            // 3) spawn other types (for blueprints)
			var getLocaleType = function (localeRandom, sectorType, l, isEarly) {
				var localeType = localeTypes.house;

				// level-based
				if (l >= worldVO.topLevel - 1 && localeRandom < 0.25)
                    localeType = localeTypes.lab;
				// sector type based
				else {
					switch (sectorType) {
					case SectorConstants.SECTOR_TYPE_RESIDENTIAL:
					case SectorConstants.SECTOR_TYPE_PUBLIC:
						if (localeRandom > 0.7) localeType = localeTypes.house;
                        else if (localeRandom > 0.6) localeType = localeTypes.transport;
                        else if (localeRandom > 0.55) localeType = localeTypes.sewer;
                        else if (localeRandom > 0.45) localeType = localeTypes.warehouse;
                        else if (localeRandom > 0.4) localeType = localeTypes.camp;
                        else if (localeRandom > 0.3) localeType = localeTypes.hut;
                        else if (localeRandom > 0.2 && !isEarly) localeType = localeTypes.hermit;
                        else if (localeRandom > 0.1) localeType = localeTypes.caravan;
                        else localeType = localeTypes.market;
						break;

                    case SectorConstants.SECTOR_TYPE_INDUSTRIAL:
                        if (localeRandom > 0.5) localeType = localeTypes.factory;
                        else if (localeRandom > 0.3) localeType = localeTypes.warehouse;
                        else if (localeRandom > 0.2) localeType = localeTypes.transport;
                        else if (localeRandom > 0.1) localeType = localeTypes.sewer;
                        else localeType = localeTypes.market;
                        break;

                    case SectorConstants.SECTOR_TYPE_MAINTENANCE:
                        if (localeRandom > 0.6) localeType = localeTypes.maintenance;
                        else if (localeRandom > 0.4) localeType = localeTypes.transport;
                        else if (localeRandom > 0.3 && !isEarly) localeType = localeTypes.hermit;
                        else if (localeRandom > 0.2) localeType = localeTypes.caravan;
                        else localeType = localeTypes.sewer;
                        break;

                    case SectorConstants.SECTOR_TYPE_COMMERCIAL:
                        if (localeRandom > 6) localeType = localeTypes.market;
                        else if (localeRandom > 0.4) localeType = localeTypes.warehouse;
                        else if (localeRandom > 0.3) localeType = localeTypes.transport;
                        else if (localeRandom > 0.25) localeType = localeTypes.hut;
                        else if (localeRandom > 0.2 && !isEarly) localeType = localeTypes.hermit;
                        else if (localeRandom > 0.15 && !isEarly) localeType = localeTypes.caravan;
                        else localeType = localeTypes.house;
                        break;

                    case SectorConstants.SECTOR_TYPE_SLUM:
                        if (localeRandom > 0.4) localeType = localeTypes.house;
                        else if (localeRandom > 0.35) localeType = localeTypes.camp;
                        else if (localeRandom > 0.3) localeType = localeTypes.hut;
                        else if (localeRandom > 0.25 && !isEarly) localeType = localeTypes.hermit;
                        else localeType = localeTypes.sewer;
                        break;
                        
                    case SectorConstants.SECTOR_TYPE_PUBLIC:
                        if (localeRandom < 0.3) localeType = localeTypes.lab;
                        else if (localeRandom < 0.6) localeType = localeTypes.transport;
                        else localeType = localeTypes.library;
                        break;

					default:
						log.w("Unknown sector type " + sectorType);
                        return null;
					}
				}
				return localeType;
			};
			var createLocales = function (worldVO, levelVO, campOrdinal, isEarly, count, countEasy) {
                var pathConstraints = [];
                for (var j = 0; j < levelVO.campPositions.length; j++) {
                    var pathType = isEarly ? WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_1 : WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_2;
                    var pos = levelVO.campPositions[j];
                    var length = WorldCreatorConstants.getMaxPathLength(campOrdinal, pathType);
                    pathConstraints.push(new PathConstraintVO(pos, length, pathType));
                }
                var excludedZones = isEarly ? [ WorldConstants.ZONE_POI_2, WorldConstants.ZONE_EXTRA_CAMPABLE, WorldConstants.ZONE_CAMP_TO_PASSAGE ] : [ WorldConstants.ZONE_PASSAGE_TO_CAMP, WorldConstants.ZONE_POI_1, WorldConstants.ZONE_EXTRA_CAMPABLE ];
                var options = { requireCentral: false, excludingFeature: "camp", pathConstraints: pathConstraints, excludedZones: excludedZones, numDuplicates: 2 };
                var l = levelVO.level;
                var sseed = seed - (isEarly ? 5555 : 0) + (l + 50) * 2;
				for (var i = 0; i < count; i++) {
					var localePos = WorldCreatorRandom.randomSectors(sseed + i + i * 7394 * sseed + i * i * l + i, worldVO, levelVO, 1, 2, options);
                    var sectorVO = localePos[0];
                    if (!sectorVO) continue;
                    if (!sectorVO.sectorType) {
                        log.w("wtf " + localePos + " " + sectorVO.sectorType);
                        log.w(sectorVO);
                    }
                    var localeType = getLocaleType(WorldCreatorRandom.random(sseed + sseed + i * seed + localePos), sectorVO.sectorType, l, isEarly);
                    var isEasy = i <= countEasy;
                    var locale = new LocaleVO(localeType, isEasy, isEarly);
                    addLocale(sectorVO, locale);
                    // log.i(levelVO.level + " added locale: isEarly:" + isEarly + ", distance to camp: " + WorldCreatorHelper.getDistanceToCamp(worldVO, levelVO, sectorVO) + ", zone: " + sectorVO.zone);
                    for (var j = 0; j < pathConstraints.length; j++) {
                        WorldCreatorHelper.addCriticalPath(worldVO, sectorVO.position, pathConstraints[j].startPosition, pathConstraints[j].pathType);
                    }
				}
            };


            // TODO have some blueprints on campless levels too (but ensure not critical ones)
            if (!levelVO.isCampable) return;

			// min number of (easy) locales ensures that player can get all upgrades intended for that level
            // two "levels" of locales for critical paths, those on path 2 can require tech from path 1 to reach but not the other way around
            var numEarlyBlueprints = UpgradeConstants.getPiecesByCampOrdinal(campOrdinal, UpgradeConstants.BLUEPRINT_TYPE_EARLY);
            if (numEarlyBlueprints) {
				var minEarly = WorldCreatorConstants.getMinLocales(numEarlyBlueprints);
                var maxEarly = WorldCreatorConstants.getMaxLocales(numEarlyBlueprints);
				var countEarly = WorldCreatorRandom.randomInt((seed % 84) * l * l * l + 1, minEarly, maxEarly + 1);
                createLocales(worldVO, levelVO, campOrdinal, true, countEarly, minEarly);
            } else {
                log.w("no early blueprints on camp level " + l);
            }

            var numLateBlueprints = UpgradeConstants.getPiecesByCampOrdinal(campOrdinal, UpgradeConstants.BLUEPRINT_TYPE_LATE);
            if (numLateBlueprints > 0) {
                var minLate = WorldCreatorConstants.getMinLocales(numLateBlueprints);
                var maxLate = WorldCreatorConstants.getMaxLocales(numLateBlueprints);
				var countLate = WorldCreatorRandom.randomInt((seed % 84) * l * l * l + 1, minLate, maxLate + 1);
                createLocales(worldVO, levelVO, campOrdinal, false, countLate, minLate);
            } else {
                log.w("no late blueprints on camp level " + l);
            }
        },
        
        addMovementBlocker: function (worldVO, levelVO, sectorVO, neighbourVO, blockerType, options, sectorcb, cb) {
            var direction = PositionConstants.getDirectionFrom(sectorVO.position, neighbourVO.position);
            var neighbourDirection = PositionConstants.getDirectionFrom(neighbourVO.position, sectorVO.position);

            // check for existing movement blocker
            if (sectorVO.movementBlockers[direction] || neighbourVO.movementBlockers[neighbourDirection]) {
                var existing = sectorVO.movementBlockers[direction] || neighbourVO.movementBlockers[neighbourDirection];
                log.w(this, "skipping movement blocker (" + blockerType + "): sector already has movement blocker (" + existing + ")");
                return;
            }
            
            // check for too close to camp or in ZONE_PASSAGE_TO_CAMP
            if (sectorVO.isCamp || neighbourVO.isCamp || (levelVO.isCampable && sectorVO.zone == WorldConstants.ZONE_PASSAGE_TO_CAMP)) {
                log.w(this, "skipping movement blocker (" + blockerType + "): too close to camp");
                return;
            }

            // check for critical paths
            var allowedForGangs = [ WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_1, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_2, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE ];
            for (var i = 0; i < sectorVO.criticalPaths.length; i++) {
                var pathType = sectorVO.criticalPaths[i];
                if (options.allowedCriticalPaths && options.allowedCriticalPaths.indexOf(pathType) >= 0) continue;
                if (blockerType === MovementConstants.BLOCKER_TYPE_GANG && allowedForGangs.indexOf(pathType) >= 0) continue;
                for (var j = 0; j < neighbourVO.criticalPaths.length; j++) {
                    if (pathType === neighbourVO.criticalPaths[j]) {
                        log.w("(level " + levelVO.level + ") Skipping blocker on critical path: " + pathType + " (type: " + blockerType + ")");
                        return;
                    }
                }
            }
                    
            // add blocker
            sectorVO.addBlocker(direction, blockerType);
            neighbourVO.addBlocker(neighbourDirection, blockerType);

            // add blockers to adjacent paths too (if present) so player can't just walk around the blocker
            if (options.addDiagonals) {
                var diagonalsOptions = Object.assign({}, options);
                diagonalsOptions.addDiagonals = false;
                var nextNeighbours = levelVO.getNextNeighbours(sectorVO, direction);
                for (var j = 0; j < nextNeighbours.length; j++) {
                    this.addMovementBlocker(worldVO, levelVO, sectorVO, nextNeighbours[j], blockerType, diagonalsOptions, sectorcb);
                }
                nextNeighbours = levelVO.getNextNeighbours(neighbourVO, neighbourDirection);
                for (var j = 0; j < nextNeighbours.length; j++) {
                    this.addMovementBlocker(worldVO, levelVO, neighbourVO, nextNeighbours[j], blockerType, diagonalsOptions, sectorcb);
                }
            }
            
            worldVO.resetPaths();

            if (sectorcb) {
                sectorcb(sectorVO, direction);
                sectorcb(neighbourVO, neighbourDirection);
            }
            
            if (cb) {
                cb();
            }
        },
        
        getPossibleEnemies: function (seed, worldVO, levelVO, sectorVO, enemyCreator) {
			var l = sectorVO.position.level;
			var x = sectorVO.position.sectorX;
			var y = sectorVO.position.sectorY;
            var campOrdinal = levelVO.campOrdinal;
            var step = WorldConstants.getCampStep(sectorVO.zone);
            var isPollutedLevel = levelVO.notCampableReason === LevelConstants.UNCAMPABLE_LEVEL_TYPE_POLLUTION;
            var isRadiatedLevel = levelVO.notCampableReason === LevelConstants.UNCAMPABLE_LEVEL_TYPE_RADIATION;
            
			var enemyDifficulty = enemyCreator.getDifficulty(campOrdinal, step);
            if (sectorVO.isOnEarlyCriticalPath()) enemyDifficulty -= 2;
            enemyDifficulty = Math.max(enemyDifficulty, 1);
            sectorVO.enemyDifficulty = enemyDifficulty;

			var enemies = [];
            
            // collect all valid enemies for this sector (candidates)
            var candidates = [];
            var enemy;
            var candidateDifficulties = [];
            var addEnemyCandidates = function (enemyType) {
                var typeEnemies = enemyCreator.getEnemies(enemyType, enemyDifficulty, false);
    			for (var e in typeEnemies) {
    				enemy = typeEnemies[e];
    				candidates.push(enemy);
                    candidateDifficulties.push(enemyCreator.getEnemyDifficultyLevel(enemy));
    			}
            };

            addEnemyCandidates(EnemyConstants.enemyTypes.global);
            if (!isPollutedLevel && !isRadiatedLevel && !sectorVO.hazards.hasHazards()) addEnemyCandidates(EnemyConstants.enemyTypes.nohazard);
            if (sectorVO.hazards.cold > 0) addEnemyCandidates(EnemyConstants.enemyTypes.cold);
            if (isPollutedLevel || sectorVO.hazards.poison > 0) addEnemyCandidates(EnemyConstants.enemyTypes.toxic);
            if (isRadiatedLevel || sectorVO.hazards.radiation > 0) addEnemyCandidates(EnemyConstants.enemyTypes.radiation);
            if (sectorVO.sunlit) addEnemyCandidates(EnemyConstants.enemyTypes.sunlit);
            if (!sectorVO.sunlit) addEnemyCandidates(EnemyConstants.enemyTypes.dark);
            if (!isPollutedLevel && !isRadiatedLevel && sectorVO.buildingDensity > 5) addEnemyCandidates(EnemyConstants.enemyTypes.dense);
            if (!isPollutedLevel && !isRadiatedLevel && sectorVO.buildingDensity <= 5) addEnemyCandidates(EnemyConstants.enemyTypes.sparse);
            
            var hasWater = sectorVO.hasWater();
            var directions = PositionConstants.getLevelDirections();
            var neighbours = levelVO.getNeighbours(x, y);
            for (var d in directions) {
                var direction = directions[d];
                var neighbour = neighbours[direction];
                if (neighbour) {
                    hasWater = hasWater || neighbour.hasWater();
                }
            }
            if (!isPollutedLevel && !isRadiatedLevel && hasWater) addEnemyCandidates(EnemyConstants.enemyTypes.water);

            // check that we found some candidates
			if (candidates.length < 1) {
                log.w("No valid enemies defined for sector " + sectorVO.position + " difficulty " + enemyDifficulty);
                return enemies;
            }
            
            // select enemies from candidates by rarity and difficulty
            candidates = candidates.sort(function (a,b) {
                return a.rarity - b.rarity;
            });
            candidateDifficulties = candidateDifficulties.sort(function (a,b) {
                return a - b;
            });
            
            var minDifficulty = levelVO.isHard ? candidateDifficulties[Math.floor(candidateDifficulties.length/2)] : candidateDifficulties[0];
            for (var i = 0; i < candidates.length; i++) {
                enemy = candidates[i];
                if (enemyCreator.getEnemyDifficultyLevel(enemy) < minDifficulty)  continue;
				var threshold = (enemy.rarity + 5) / 110;
				var r = WorldCreatorRandom.random(9999 + l * seed + x * l * 80 + y * 10 + i * x *22 - y * i * x * 15);
                if (i == 0 || r > threshold) {
                    enemies.push(enemy);
                }
            }

			return enemies;
        },
        
        getLevelBlockerTypes: function (levelVO) {
            var levelOrdinal = levelVO.levelOrdinal;
            var campOrdinal = levelVO.campOrdinal;
            var isPollutedLevel = levelVO.notCampableReason === LevelConstants.UNCAMPABLE_LEVEL_TYPE_POLLUTION;
            var isRadiatedLevel = levelVO.notCampableReason === LevelConstants.UNCAMPABLE_LEVEL_TYPE_RADIATION;
                        
            var blockerTypes = [];
            if (levelOrdinal > 1) {
                blockerTypes.push(MovementConstants.BLOCKER_TYPE_DEBRIS);
                blockerTypes.push(MovementConstants.BLOCKER_TYPE_DEBRIS);
            }
            if (campOrdinal >= 5) {
                blockerTypes.push(MovementConstants.BLOCKER_TYPE_GAP);
            }
            if (campOrdinal >= 7) {
                blockerTypes.push(MovementConstants.BLOCKER_TYPE_WASTE_TOXIC);
            }
            if (levelVO.level >= 14 && isRadiatedLevel) {
                blockerTypes.push(MovementConstants.BLOCKER_TYPE_WASTE_RADIOACTIVE);
            }
            return blockerTypes;
        }
        
    };
    
    return SectorGenerator;
});
