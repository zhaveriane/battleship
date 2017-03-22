// GAME SETUP
var initialState = SKIPSETUP ? "playing" : "setup";
var gameState = new GameState({state: initialState});
var cpuBoard = new Board({autoDeploy: true, name: "cpu"});
var playerBoard = new Board({autoDeploy: SKIPSETUP, name: "player"});
var cursor = new Cursor();

// UI SETUP
setupUserInterface();
// Map Leap Motion coordinates to battleship
// May need to reconfigure with different screen sizes?
var shipOffsetX = 300;
var shipOffsetY = 35;
var appWidth = BOARDSIZE*2 + shipOffsetX;
var appHeight = BOARDSIZE*1.5 + shipOffsetY;
var leapXstart = 450;
var leapXend = 1150;
var leapYstart = 100;
var leapYend = 500;
var getCursorPosition = function(pos) {
  var leapX = pos[0];
  var leapY = pos[1];
  var appX = (leapX - leapXstart) * appWidth / (leapXend - leapXstart) + shipOffsetX;
  var appY = (leapY - leapYstart) * appHeight / (leapYend - leapYstart) + shipOffsetY;
  return [appX, appY];
}

// selectedTile: The tile that the player is currently hovering above
var selectedTile = false;

// grabbedShip/Offset: The ship and offset if player is currently manipulating a ship
var grabbedShip = false;
var grabbedOffset = [0, 0];
// var grabbedRollOffset = 0;
// var getShipRotation = function(roll) {
//   return -(roll-grabbedRollOffset);
// }

// isGrabbing: Is the player's hand currently in a grabbing pose
var isGrabbing = false;
var grabThreshold = 0.9;

var numberCPUMisses = 0;
var numberCPUHits = 0;

var numberPlayerMisses = 0;
var numberPlayerHits = 0;

// MAIN GAME LOOP
// Called every time the Leap provides a new frame of data
Leap.loop({ hand: function(hand) {
  // Clear any highlighting at the beginning of the loop
  unhighlightTiles();

  // 4.1, Moving the cursor with Leap data
  // Use the hand data to control the cursor's screen position
  var cursorPosition = getCursorPosition(hand.screenPosition());
  cursor.setScreenPosition(cursorPosition);

  // 4.1
  // Get the tile that the player is currently selecting, and highlight it
  selectedTile = getIntersectingTile(cursorPosition);
  if (selectedTile) {
    highlightTile(selectedTile, "#fffda3");
  }

  // SETUP mode
  if (gameState.get('state') == 'setup') {
    background.setContent("<h1>battleship</h1><h3 style='color: #7CD3A2;'>deploy ships</h3>");
    // 4.2, Deploying ships
    // Enable the player to grab, move, rotate, and drop ships to deploy them

    // First, determine if grabbing pose or not
    isGrabbing = hand.grabStrength > grabThreshold;

    // Grabbing, but no selected ship yet. Look for one.
    // Update grabbedShip/grabbedOffset if the user is hovering over a ship
    if (!grabbedShip && isGrabbing) {
      grabbedShip = getIntersectingShipAndOffset(cursorPosition);
      // if (grabbedShip) {
      //   grabbedRollOffset = hand.roll() + grabbedShip.getShipRotation();
      //   console.log("roll offset: " + grabbedRollOffset);
      // }
    }

    // Has selected a ship and is still holding it
    // Move the ship
    else if (grabbedShip && isGrabbing) {
      grabbedShip.ship.setScreenPosition([cursorPosition[0]-grabbedShip.offset[0], cursorPosition[1]-grabbedShip.offset[1]]);
      grabbedShip.ship.setScreenRotation(-hand.roll());
    }

    // Finished moving a ship. Release it, and try placing it.
    // Try placing the ship on the board and release the ship
    else if (grabbedShip && !isGrabbing) {
      placeShip(grabbedShip.ship);
      isGrabbing = false;
      grabbedShip = false;
    }
  }

  // PLAYING or END GAME so draw the board and ships (if player's board)
  // Note: Don't have to touch this code
  else {
    if (gameState.get('state') == 'playing') {
      background.setContent("<h1>battleship</h1><h3 style='color: #7CD3A2;'>game on</h3>");
      turnFeedback.setContent(gameState.getTurnHTML());
    }
    else if (gameState.get('state') == 'end') {
      var endLabel = gameState.get('winner') == 'player' ? 'you won!' : 'game over';
      background.setContent("<h1>battleship</h1><h3 style='color: #7CD3A2;'>"+endLabel+"</h3>");
      turnFeedback.setContent("");
    }

    var board = gameState.get('turn') == 'player' ? cpuBoard : playerBoard;
    // Render past shots
    board.get('shots').forEach(function(shot) {
      var position = shot.get('position');
      var tileColor = shot.get('isHit') ? Colors.RED : Colors.YELLOW;
      highlightTile(position, tileColor);
    });

    // Render the ships
    playerBoard.get('ships').forEach(function(ship) {
      if (gameState.get('turn') == 'cpu') {
        var position = ship.get('position');
        var screenPosition = gridOrigin.slice(0);
        screenPosition[0] += position.col * TILESIZE;
        screenPosition[1] += position.row * TILESIZE;
        ship.setScreenPosition(screenPosition);
        if (ship.get('isVertical'))
          ship.setScreenRotation(Math.PI/2);
      } else {
        ship.setScreenPosition([-500, -500]);
      }
    });

    // If playing and CPU's turn, generate a shot
    if (gameState.get('state') == 'playing' && gameState.isCpuTurn() && !gameState.get('waiting')) {
      gameState.set('waiting', true);
      generateCpuShot();
    }
  }
}}).use('screenPosition', {scale: LEAPSCALE});

// processSpeech(transcript)
//  Is called anytime speech is recognized by the Web Speech API
// Input: 
//    transcript, a string of possibly multiple words that were recognized
// Output: 
//    processed, a boolean indicating whether the system reacted to the speech or not
var processSpeech = function(transcript) {
  // Helper function to detect if any commands appear in a string
  var userSaid = function(str, commands) {
    for (var i = 0; i < commands.length; i++) {
      if (str.indexOf(commands[i]) > -1)
        return true;
    }
    return false;
  };
  console.log("processing");
  var processed = false;
  if (gameState.get('state') == 'setup') {
    // TODO: 4.3, Starting the game with speech
    // Detect the 'start' command, and start the game if it was said
    if (userSaid(transcript, ["start"])) {
      gameState.startGame();
      processed = true;
    }
  }

  else if (gameState.get('state') == 'playing') {
    if (gameState.isPlayerTurn()) {
      // TODO: 4.4, Player's turn
      // Detect the 'fire' command, and register the shot if it was said
      if (userSaid(transcript, ["fire", "I are", "iron"])) {
        console.log("fire");
        registerPlayerShot();

        processed = true;
      }
    }

    else if (gameState.isCpuTurn() && gameState.waitingForPlayer()) {
      // TODO: 4.5, CPU's turn
      // Detect the player's response to the CPU's shot: hit, miss, you sunk my ..., game over
      // and register the CPU's shot if it was said
      if (userSaid(transcript, ["hit", "miss", "sunk", "game over"])) {
        var response = "playerResponse";
        registerCpuShot(response);

        processed = true;
      }
    }
  }

  return processed;
};

// TODO: 4.4, Player's turn
// Generate CPU speech feedback when player takes a shot
var registerPlayerShot = function() {
  // TODO: CPU should respond if the shot was off-board
  var message = "";
  if (!selectedTile) {
    message = "That shot was off the board.";
    console.log(message);
    generateSpeech(message);
  }

  // If aiming at a tile, register the player's shot
  else {
    var shot = new Shot({position: selectedTile});
    var result = cpuBoard.fireShot(shot);

    // Duplicate shot
    if (!result) return;

    // TODO: Generate CPU feedback in three cases
    // Game over
    if (result.isGameOver) {
      gameState.endGame("player");
      message = "Congratulations, you sunk all my ships!";
      console.log(message);
      generateSpeech(message);
      return;
    }
    // Sunk ship
    else if (result.sunkShip) {
      var shipName = result.sunkShip.get('type');
      
      numberPlayerHits++;
      if (numberPlayerHits === 2) {
        message = "Two hits in a row means nothing, fool.";
      } 
      else if (numberPlayerHits === 3) {
        message = "Impressive. Three hits in a row. ";
      }
      else if (numberPlayerHits >= 4) {
        message = "This is unfair, you must be cheating. ";
      }
      else {
        if (numberPlayerMisses === 2) {
          message = "Guess that wasn't much of a losing streak. ";
        } 
        else if (numberPlayerMisses === 3) {
          message = "You were bound to get one eventually. ";
        }
        else if (numberPlayerMisses >= 4) {
          message = "Glad you finally hit one, loser. ";
        }
      }
      numberPlayerMisses = 0;
      message += "You sunk my "+shipName+"!";
    }
    // Hit or miss
    else {
      var isHit = result.shot.get('isHit');
      var shipName = result.sunkShip.get('type');

      if (isHit) {
        
        numberPlayerHits++;
        if (numberPlayerHits === 2) {
          message = "Two hits in a row means nothing, fool.";
        } 
        else if (numberPlayerHits === 3) {
          message = "Impressive. Three hits in a row. ";
        }
        else if (numberPlayerHits >= 4) {
          message = "This is unfair, you must be cheating. ";
        } 
        else {
          if (numberPlayerMisses === 2) {
            message = "Guess that wasn't much of a losing streak";
          } 
          else if (numberPlayerMisses === 3) {
            message = "You were bound to get one eventually.";
          }
          else if (numberPlayerMisses >= 4) {
            message = "Glad you finally hit one, loser.";
          }
          else {
            message = "You hit something, human.";
          }
        }
        numberPlayerMisses = 0;

      } else {
        numberPlayerMisses++;
        
        if (numberPlayerMisses === 2) {
          message = "Two misses isn't so bad";
        } 
        else if (numberPlayerMisses === 3) {
          message = "Jeeze man, its kinda hard to be this terrible.";
        }
        else if (numberPlayerMisses >= 4) {
          message = "Prepare to lose, silly human.";
        }
        else {
          if (numberPlayerHits === 2) {
            message = "Told you it was nothing. Prepare to lose.";
          } 
          else if (numberPlayerHits === 3) {
            message = "Wow, glad that's over, it's my turn now.";
          }
          else if (numberPlayerHits >= 4) {
            message = "The end of an era. I'm barely hanging on.";
          }
          else {
            message = "You missed.";
          }
        }
        numberPlayerHits = 0;
      }
    }
    console.log(message)
    generateSpeech(message);

    if (!result.isGameOver) {
      // TODO: Uncomment nextTurn to move onto the CPU's turn
      nextTurn();
    }
  }
};

// TODO: 4.5, CPU's turn
// Generate CPU shot as speech and blinking
var cpuShot;
var generateCpuShot = function() {
  // Generate a random CPU shot
  cpuShot = gameState.getCpuShot();
  var tile = cpuShot.get('position');
  var rowName = ROWNAMES[tile.row]; // e.g. "A"
  var colName = COLNAMES[tile.col]; // e.g. "5"

  // TODO: Generate speech and visual cues for CPU shot
  var message = "fire "+rowName+" "+colName;
  console.log(message);
  generateSpeech(message);
  blinkTile(tile);
};

// TODO: 4.5, CPU's turn
// Generate CPU speech in response to the player's response
// E.g. CPU takes shot, then player responds with "hit" ==> CPU could then say "AWESOME!"
var registerCpuShot = function(playerResponse) {
  // Cancel any blinking
  unblinkTiles();
  var result = playerBoard.fireShot(cpuShot);
  var message = "";

  // NOTE: Here we are using the actual result of the shot, rather than the player's response
  // In 4.6, you may experiment with the CPU's response when the player is not being truthful!

  // TODO: Generate CPU feedback in three cases
  // Game over
  if (result.isGameOver) {
    gameState.endGame("cpu");
    message = "Better luck next time, I win";
    console.log(message);
    generateSpeech(message);
    return;
  }
  // Sunk ship
  else if (result.sunkShip) {
    var shipName = result.sunkShip.get('type');
    numberCPUHits++;
    numberCPUMisses = 0;
    if (numberCPUHits === 2) {
      message = "Heating up! That's two in a row";
    } 
    else if (numberCPUHits === 3) {
      message = "Heck yeah, I'm on fire.";
    }
    message += "I sunk your "+shipName+"!";
  }
  // Hit or miss
  else {
    var isHit = result.shot.get('isHit');
    if (isHit) {
      var shipName = result.sunkShip.get('type');
      numberCPUMisses = 0;
      numberCPUHits++;
      if (numberCPUHits === 2) {
        message = "Heating up! That's two hits in a row";
      } 
      else if (numberCPUHits === 3) {
        message = "Heck yeah, I'm on fire. Three hits in a row";
      }
      else if (numberCPUHits >= 4) {
        message = "I'm gonna beat you so fast at this rate";
      }
      else {
        if (numberCPUMisses === 2) {
          message = "This is the start of something great. I'm gonna go on a run.";
        } 
        else if (numberCPUMisses === 3) {
          message = "Okay, I can still come back from this.";
        }
        else if (numberCPUMisses >= 4) {
          message = "I'm down, but not out!";
        }
        else {
          message = "You bet I hit something, there's more where that came from.";
        }
      }
    } else {
      var shipName = result.sunkShip.get('type');
      numberCPUMisses++;
      numberCPUHits = 0;
      if (numberCPUMisses === 2) {
        message = "I missed twice in a row? Wow.";
      } 
      else if (numberCPUMisses === 3) {
        message = "Wow I suck at this, three times in a row.";
      }
      else if (numberCPUMisses >= 4) {
        message = "Haven't you won yet? It can't get much worse for me.";
      }
      else {
        if (numberCPUHits === 2) {
          message = "I had a good streak.";
        } 
        else if (numberCPUHits === 3) {
          message = "I was bound to miss eventually.";
        }
        else if (numberCPUHits >= 4) {
          message = "OK, I missed, but you're totally gonna lose.";
        }
        else {
          message = "Happens, I'll get it next time.";
        }
      }
    }
  }
  console.log(message);
  generateSpeech(message);

  if (!result.isGameOver) {
    // TODO: Uncomment nextTurn to move onto the player's next turn
    nextTurn();
  }
};

