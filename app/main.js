// GAME SETUP
var initialState = SKIPSETUP ? "playing" : "setup";
var gameState = new GameState({state: initialState});
var cpuBoard = new Board({autoDeploy: true, name: "cpu"});
var playerBoard = new Board({autoDeploy: SKIPSETUP, name: "player"});
var cursor = new Cursor();

var isRightHand = 1; // -1 if left hand

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
var grabs = [];

// isGrabbing: Is the player's hand currently in a grabbing pose
var isGrabbing = false;
var grabThreshold = 0.9;
var shipRotation = function(handroll) {
  var roll = handroll*1.5;
  if (roll > 0) {
    roll = 0;
  } else if (roll < -Math.PI/2) {
    roll = -Math.PI/2;
  }
  return -roll;
}
var handrolls = [];

// Smoothing
var add = function(a, b) {
    return a + b;
}
var smooth = function(list, w) {
  if (w === 0) {
    return list[list.length - 1];
  }
  var n = Math.min(w, list.length);
  var arr = list.slice(list.length-n);
  var sum = arr.reduce(add, 0);
  return sum / n;
}

var numberCPUMisses = 0;
var numberCPUHits = 0;

var numberPlayerMisses = 0;
var numberPlayerHits = 0;

var playerResponse = "";
var numberLies = 0;

// MAIN GAME LOOP
// Called every time the Leap provides a new frame of data
Leap.loop({ hand: function(hand) {
  if (hand.isRight) {
    isRightHand = 1;
  } else {
    isRightHand = -1;
  }
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
    highlightTile(selectedTile, Colors.GREEN);
  }

  // SETUP mode
  if (gameState.get('state') == 'setup') {
    numberCPUMisses = 0;
    numberCPUHits = 0;

    numberPlayerMisses = 0;
    numberPlayerHits = 0;

    background.setContent("<h1>battleship</h1><h3 style='color: #7CD3A2;'>deploy ships</h3>");
    // 4.2, Deploying ships
    // Enable the player to grab, move, rotate, and drop ships to deploy them

    // First, determine if grabbing pose or not
    grabs.push(hand.grabStrength);
    isGrabbing = smooth(grabs, 5) > grabThreshold;

    // Grabbing, but no selected ship yet. Look for one.
    // Update grabbedShip/grabbedOffset if the user is hovering over a ship
    if (!grabbedShip && isGrabbing) {
      grabbedShip = getIntersectingShipAndOffset(cursorPosition);
    }

    // Has selected a ship and is still holding it
    // Move the ship
    else if (grabbedShip && isGrabbing) {
      grabbedShip.ship.setScreenPosition([cursorPosition[0]-grabbedShip.offset[0], cursorPosition[1]-grabbedShip.offset[1]]);
      handrolls.push(hand.roll());
      grabbedShip.ship.setScreenRotation(shipRotation(smooth(handrolls, 5)));
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
      if (str.indexOf(commands[i]) > -1) {
        var command = commands[i]
        playerResponse = command.toLowerCase();
        console.log("command changed to " + playerResponse);
        return true;
      }
    }
    // console.log("command changed to empty string");
    playerResponse = "";
    return false;
  };
  // console.log("processing");
  var processed = false;
  if (gameState.get('state') == 'setup') {
    // TODO: 4.3, Starting the game with speech
    // Detect the 'start' command, and start the game if it was said
    if (userSaid(transcript, ["start", "star"])) {
      gameState.startGame();
      processed = true;
    }
  }

  else if (gameState.get('state') == 'playing') {
    if (gameState.isPlayerTurn()) {
      // TODO: 4.4, Player's turn
      // Detect the 'fire' command, and register the shot if it was said
      if (userSaid(transcript, ["fire"])) {
        registerPlayerShot();

        processed = true;
      }
    }

    else if (gameState.isCpuTurn() && gameState.waitingForPlayer()) {
      // TODO: 4.5, CPU's turn
      // Detect the player's response to the CPU's shot: hit, miss, you sunk my ..., game over
      // and register the CPU's shot if it was said
      if (userSaid(transcript, ["hit", "miss", "sunk", "game over", "Miss"])) {
        registerCpuShot(playerResponse);
        processed = true;
        playerResponse = "";
      }
    }
  }

  return processed;
};

// TODO: 4.4, Player's turn
// Generate CPU speech feedback when player takes a shot
var registerPlayerShot = function() {
  console.log("register player shot");
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
  console.log("register cpu shot");
  // Cancel any blinking
  unblinkTiles();
  var result = playerBoard.fireShot(cpuShot);
  var message = "";

  // 4.6 Allow player to lie up to 2 times
  if (numberLies < 3) {
    switch (playerResponse) {
      case "game over":
        if (!result.isGameOver) {
          numberLies = 2;
        }
        break;
      case "sunk":
        if (!result.sunkShip) {
          numberLies++;
        }
        numberCPUHits++;
        numberCPUMisses = 0;
        if (numberCPUHits === 2) {
          message += "Heating up! That's two in a row ";
        } 
        else if (numberCPUHits === 3) {
          message += "Heck yeah, I'm on fire. ";
        }
        message += "I sunk your ship!";
        break;
      case "hit":
        if (!result.shot.get('isHit')) {
          numberLies++;
        }
        numberCPUMisses = 0;
        numberCPUHits++;
        if (numberCPUHits === 2) {
          message += "Heating up! That's two hits in a row";
        } 
        else if (numberCPUHits === 3) {
          message += "Heck yeah, I'm on fire. Three hits in a row";
        }
        else if (numberCPUHits >= 4) {
          message += "I'm gonna beat you so fast at this rate";
        }
        else {
          if (numberCPUMisses === 2) {
            message += "This is the start of something great. I'm gonna go on a run.";
          } 
          else if (numberCPUMisses === 3) {
            message += "Okay, I can still come back from this.";
          }
          else if (numberCPUMisses >= 4) {
            message += "I'm down, but not out!";
          }
          else {
            message += "You bet I hit something, there's more where that came from.";
          }
        }
        break;
      case "miss":
        if (result.shot.get('isHit')) {
          numberLies++;
        }
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
        break;
      default:
    }
    if (numberLies === 2) {
      message += "You've definitely been lying to me. I'll be checking up on you. ";
      numberLies++;
    }

    console.log(message);
    generateSpeech(message);

    if (!result.isGameOver) {
      nextTurn();
    }
    return;
  }

  // NOTE: Here we are using the actual result of the shot, rather than the player's response
  // In 4.6, you may experiment with the CPU's response when the player is not being truthful!
  if (result.isGameOver) {
    switch (playerResponse) {
      case "miss":
        message += "What? You can't lie to me, I know I hit that ship. "
        var position = cpuShot.get('position');
        highlightTile(position, Colors.RED);
      break;
      default:
    }
    gameState.endGame("cpu");
    message = "Better luck next time, I win";
    console.log(message);
    generateSpeech(message);
    return;
  }
  // Sunk ship
  else if (result.sunkShip) {
    switch (playerResponse) {
      case "miss":
        message += "What? You can't lie to me, I know I hit that ship. "
        var position = cpuShot.get('position');
        highlightTile(position, Colors.RED);
      break;
      case "game over":
        message += "It's not game over yet. "
      break;
      default:
    }
    var shipName = result.sunkShip.get('type');
    numberCPUHits++;
    numberCPUMisses = 0;
    if (numberCPUHits === 2) {
      message += "Heating up! That's two in a row ";
    } 
    else if (numberCPUHits === 3) {
      message += "Heck yeah, I'm on fire. ";
    }
    message += "I sunk your "+shipName+"!";
  }
  // Hit or miss
  else {
    var isHit = result.shot.get('isHit');
    if (isHit) {
      switch (playerResponse) {
        case "miss":
          message += "What? You can't lie to me, I know I hit that ship. ";
        break;
        case "sunk":
          message += "I didn't sink your ship fool. ";
        break;
        case "game over":
          message += "It's not game over yet. ";
        break;
        default:
      }
      numberCPUMisses = 0;
      numberCPUHits++;
      if (numberCPUHits === 2) {
        message += "Heating up! That's two hits in a row";
      } 
      else if (numberCPUHits === 3) {
        message += "Heck yeah, I'm on fire. Three hits in a row";
      }
      else if (numberCPUHits >= 4) {
        message += "I'm gonna beat you so fast at this rate";
      }
      else {
        if (numberCPUMisses === 2) {
          message += "This is the start of something great. I'm gonna go on a run.";
        } 
        else if (numberCPUMisses === 3) {
          message += "Okay, I can still come back from this.";
        }
        else if (numberCPUMisses >= 4) {
          message += "I'm down, but not out!";
        }
        else {
          message += "You bet I hit something, there's more where that came from.";
        }
      }
    } else {
      switch (playerResponse) {
        case "hit":
          message += "What? I didn't hit anything. ";
        break;
        case "sunk":
          message += "I didn't sink your ship fool. ";
        break;
        case "game over":
          message += "It's not game over yet. ";
        break;
        default:
      }
      numberCPUMisses++;
      numberCPUHits = 0;
      if (numberCPUMisses === 2) {
        message += "I missed twice in a row? Wow.";
      } 
      else if (numberCPUMisses === 3) {
        message += "Wow I suck at this, three times in a row.";
      }
      else if (numberCPUMisses >= 4) {
        message += "Haven't you won yet? It can't get much worse for me.";
      }
      else {
        if (numberCPUHits === 2) {
          message += "I had a good streak.";
        } 
        else if (numberCPUHits === 3) {
          message += "I was bound to miss eventually.";
        }
        else if (numberCPUHits >= 4) {
          message += "OK, I missed, but you're totally gonna lose.";
        }
        else {
          message += "Happens, I'll get it next time.";
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

