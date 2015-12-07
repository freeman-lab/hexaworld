var _ = require('lodash')
var EventEmitter = require('eventemitter2').EventEmitter2
var Game = require('crtrdg-gameloop')
var Keyboard = require('crtrdg-keyboard')
var Time = require('crtrdg-time')
var Player = require('./entity/player.js')
var Camera = require('./entity/camera.js')
var World = require('./entity/world.js')
var Ring = require('./entity/ring.js')
var Mask = require('./util/mask.js')

module.exports = function (element, schema, opts) {
  opts = opts || {size: 700}
  var container = document.getElementById(element)
  var canvas = document.createElement('canvas')
  var height = container.clientHeight || opts.size

  if (height * 0.7 > window.innerWidth) {
    height = window.innerWidth * (1 / 0.7) - 30
  }

  container.style.width = height * 0.7 + 'px'
  container.style.height = height + 'px'
  container.style.position = 'relative'
  container.style.background = 'rgb(55,55,55)'

  canvas.id = 'game'
  canvas.style.marginTop = height * 0.15
  canvas.style.position = 'absolute'
  container.appendChild(canvas)

  var score = require('./ui/score.js')(container)
  var level = require('./ui/level.js')(container)
  var steps = require('./ui/steps.js')(container)
  var lives = require('./ui/lives.js')(container)

  var game = new Game({
    canvas: canvas,
    width: height * 0.7,
    height: height * 0.7
  })

  var keyboard = new Keyboard(game)

  var player = new Player(schema.players[0], {
    scale: 2,
    speed: {translation: 1.25, rotation: 8.0},
    friction: 0.9,
    stroke: 'white',
    fill: 'rgb(75,75,75)',
    thickness: 0.5
  })

  var camera = new Camera({
    scale: 100 * 1 / height,
    speed: {translation: 0.1, rotation: 0.1, scale: 0.002},
    friction: 0.9,
    yoked: true
  })

  var ring = new Ring(schema.gameplay, {
    size: 0.82 * game.width / 2,
    translation: [game.width / 2, game.width / 2],
    extent: 0.1 * game.width / 2,
    count: 8,
    offset: 3
  })

  var mask = new Mask({
    size: 0.8 * game.width / 2,
    translation: [game.width / 2, game.width / 2],
    fill: 'rgb(90,90,90)'
  })

  var world = new World(schema.tiles, {thickness: 0.4})

  var time = new Time(game)

  var events = new EventEmitter({
    wildcard: true
  })

  function relay (emitter, name, tag) {
    var emit = function (tag, value) {
      value = value || {}
      var ret = value
      if (typeof ret === 'string') {
        ret = { value: ret }
      }
      events.emit([name, tag], _.merge(ret, { time: (new Date()).toISOString() }))
    }
    if (!tag) {
      emitter.onAny(function (value) {
        emit(this.event, value)
      })
    } else {
      emitter.on(tag, function (value) {
        emit(tag, value)
      })
    }
  }

  relay(player, 'player', 'enter')
  relay(player, 'player', 'exit')
  relay(keyboard, 'keyboard', 'keyup')
  relay(keyboard, 'keyboard', 'keydown')
  relay(game, 'game', 'start')
  relay(game, 'game', 'end')

  player.addTo(game)
  camera.addTo(game)
  world.addTo(game)
  ring.addTo(game)

  keyboard.on('keydown', function (keyCode) {
    if (keyCode === '<space>') {
      if (game.paused === true) {
        game.resume()
      } else {
        game.pause()
      }
    }
  })

  player.on('update', function (interval) {
    this.move(keyboard, world)
  })

  player.on('exit', function (interval) {
    stepsVal -= 1
    steps.update(stepsVal, stepsMax)
  })

  camera.on('update', function (interval) {
    if (camera.yoked) {
      camera.transform.translation = player.position()
      camera.transform.rotation = player.angle()
    }
    this.move(keyboard)
  })

  ring.on('update', function (interval) {
    this.update(player, world)
  })

  game.on('draw', function (context) {
    mask.set(context)
    world.draw(context, camera)
    player.draw(context, camera)
    mask.unset(context)
    ring.draw(context)
  })

  game.on('update', function (interval) {
    var playerCoordinates = player.coordinates()
    var tile = world.getTileAtCoordinates(playerCoordinates)

    var target
    if (tile) {
      target = tile.target()
    }
    if (target && target.contains(player.position())) {
      var cue = tile.cue()
      if (cue && cue.props.fill) {
        ring.startFlashing(['#FFFFFF', '#999999', cue.props.fill, cue.props.fill])
      } else {
        ring.startFlashing(['#FF5050', '#FF8900', '#00C3EE', '#64FF00'])
      }
    }

    tile.children.some(function (child, i) {
      return child.children.some(function (bit, j) {
        if (bit.props.consumable && bit.contains(player.position())) {
          scoreVal += 10
          score.update(scoreVal)
          return tile.children[i].children.splice(j, 1)
        }
      })
    })
  })

  game.on('start', function () {})

  var done = false

  game.on('end', function () {
    ring.startFlashing()
    if (!done) {
      console.log('win!')
      console.log(schema.gameplay.timeout - time.seconds())
      scoreVal = scoreVal + 1000
      score.update(scoreVal)
      done = true
    }
  })

  function reload (schema) {
    world.reload(schema.tiles)
    player.reload(schema.players[0])
    ring.reload(schema.gameplay)
    lifeVal = schema.gameplay.lives
    scoreVal = 0
    stepsMax = schema.gameplay.steps
    stepsVal = schema.gameplay.steps
    level.update('playpen', 1, 2)
    score.update(scoreVal)
    steps.update(stepsVal, stepsMax)
    lives.update(lifeVal)
  }

  reload(schema)

  game.start()

  return {
    reload: reload,

    pause: function () {
      game.pause()
    },

    resume: function () {
      game.resume()
    },

    events: events
  }
}
