//thanks to zwerch (https://github.com/zwerch) for the blinds model as the basis for this accessory

//todo: add in the models & serial #s
//      clean up and refactor the get status

var request = require("request");
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-httpmulti", "HttpMulti", HttpMulti);
  console.log("Loading HttpMulti accessory");
}

function HttpMulti(log, config) {
  this.log = log;
  this.up_url = config["up_url"];
  this.down_url = config["down_url"];
  this.open_url = config["open_url"];
  this.close_url = config["close_url"];
  this.on_url = config["on_url"];
  this.off_url = config["off_url"];
  this.lock_url = config["lock_url"];
  this.unlock_url = config["unlock_url"];
  this.brightness_url = config["brightness_url"];
  if (this.brightness_url === undefined) this.brightness_url = config["speed_url"];
  if (this.brightness_url === undefined) this.brightness_url = config["setpoint_url"];
  this.gettemp_url = config["gettemp_url"];
  this.mode_url = config["mode_url"];
  this.unit_type = "C";
  if (config["tempunits"] !== undefined) this.units = config["tempunits"];
  this.status_url = config["status_url"];
  this.name = config["name"];
  this.deviceType = config["deviceType"];
  this.httpMethod = config["http_method"];
  if (this.httpMethod === undefined) this.httpMethod = "GET";

  // Populate service information.
  this.informationService = new Service.AccessoryInformation();
  if (config["accessory"]) {
    this.informationService.setCharacteristic(
      Characteristic.Manufacturer,
      config["accessory"]);
  }
  var model = config["model"];
  if (model === undefined) model = this.deviceType;
  if (model) {
    this.informationService.setCharacteristic(
      Characteristic.Model,
      model);
  }

  var serialNum = config["serialNum"];
  if (serialNum === undefined) {
    var hash;
    for (var i = 0; i < this.name.length; i++) {
      var character = this.name.charCodeAt(i);
      hash = ((hash << 5) - hash) + character;
      hash = hash & hash; // Convert to 32bit integer
    }
    serialNum = "X" + Math.abs(hash);
  }
  this.informationService.setCharacteristic(
    Characteristic.SerialNumber,
    serialNum);

  if (this.deviceType.match(/^blind/i)) {
    this.log("HttpMulti Blind Object Initializing...");
    // state vars
    this.lastPosition = 0; // last known position of the blinds, down by default
    this.lastStatePartial = 0;
    this.currentPositionState = 2; // stopped by default
    this.currentTargetPosition = 0; // down by default

    // register the service and provide the functions
    this.service = new Service.WindowCovering(this.name);

    // the current position (0-100%)
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L493
    this.service
      .getCharacteristic(Characteristic.CurrentPosition)
      .on('get', this.getCurrentStatePartial.bind(this));

    // the position state
    // 0 = DECREASING; 1 = INCREASING; 2 = STOPPED;
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L1138
    this.service
      .getCharacteristic(Characteristic.PositionState)
      .on('get', this.getPositionState.bind(this));

    // the target position (0-100%)
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L1564
    this.service
      .getCharacteristic(Characteristic.TargetPosition)
      .on('get', this.getCurrentStatePartial.bind(this))
      .on('set', this.setTargetPosition.bind(this));


  } else if (this.deviceType.match(/^light/i)) {
    this.log("HttpMulti Light Object Initializing...");

    this.lastState = 0;
    this.lastStatePartial = 0;
    this.currentState = 0;
    this.TargetState = 0;
    this.lastUpdate = Date.now();
    this.partial = 0;

    // register the service and provide the functions
    this.service = new Service.Lightbulb(this.name);

    this.service
      .getCharacteristic(Characteristic.On)
      .on('get', this.getCurrentState.bind(this))
      .on('set', this.setCurrentState.bind(this));

    if (this.brightness_url) {
      this.service
        .getCharacteristic(Characteristic.Brightness)
        .on('get', this.getCurrentStatePartial.bind(this))
        .on('set', this.setCurrentStatePartial.bind(this));
    }

  } else if (this.deviceType.match(/^fan/i)) {
    this.log("HttpMulti Fan Object Initializing...");

    this.lastState = 0;
    this.lastStatePartial = 0;
    this.currentState = 0;
    this.TargetState = 0;
    this.partial = 0;

    // register the service and provide the functions
    this.service = new Service.Fan(this.name);

    this.service
      .getCharacteristic(Characteristic.On)
      .on('get', this.getCurrentState.bind(this))
      .on('set', this.setCurrentState.bind(this));

    this.service
      .getCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getCurrentStatePartial.bind(this))
      .on('set', this.setCurrentStatePartial.bind(this));


  } else if (this.deviceType.match(/^switch/i)) {
    this.log("HttpMulti Switch Object Initializing...");

    this.lastState = 0;
    this.currentState = 0;
    this.TargetState = 0;

    // register the service and provide the functions
    this.service = new Service.Switch(this.name);

    this.service
      .getCharacteristic(Characteristic.On)
      .on('get', this.getCurrentState.bind(this))
      .on('set', this.setCurrentState.bind(this));


  } else if (this.deviceType.match(/^garagedoor/i)) {
    this.log("HttpMulti Garage door Object Initializing...");

    // state vars
    //		this.lastPosition = 0;
    this.lastState = 0;
    this.currentPositionState = 0;
    this.currentTargetPosition = 0;
    this.lastObstructed = false;

    // register the service and provide the functions
    this.service = new Service.GarageDoorOpener(this.name);

    // 0 - OPEN, 1 - CLOSED, 2 - OPENING, 3 - CLOSING, 4 - STOPPED
    this.service
      .getCharacteristic(Characteristic.CurrentDoorState)
      //        	.on('get', this.getCurrentPosition.bind(this))
      .on('get', this.getCurrentState.bind(this))


    //0 - OPEN, 1 - CLOSED
    this.service
      .getCharacteristic(Characteristic.TargetDoorState)
      .on('get', this.getCurrentState.bind(this))
      .on('set', this.setTargetDoorPosition.bind(this));

    this.service
      .getCharacteristic(Characteristic.ObstructionDetected)
      .on('get', this.getObstructed.bind(this));


  } else if (this.deviceType.match(/^lock/i)) {
    this.log("HttpMulti Lock Object Initializing...");

    this.lastState = 0;
    this.currentState = 0;
    this.TargetState = 0;

    // register the service and provide the functions
    this.service = new Service.LockMechanism(this.name);

    this.service
      .getCharacteristic(Characteristic.LockCurrentState)
      .on('get', this.getCurrentState.bind(this));

    this.service
      .getCharacteristic(Characteristic.LockTargetState)
      .on('get', this.getCurrentState.bind(this))
      .on('set', this.setCurrentLockState.bind(this));

  } else if (this.deviceType.match(/^thermostat/i)) {
    this.log("HttpMulti Thermostat Object Initializing...");

    this.lastState = 0; // 0 OFF, 1 HEAT, 2 COOL
    this.currentState = 0;
    this.TargetState = 0;
    //this.lastTemp = ;
    //this.TargetTemp = 15;
    this.units = 0; // 0 Celcius, 1 Fahrenheit
    if (this.unit_type !== "C") this.units = 1;

    this.service = new Service.Thermostat(this.name);

    this.service
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getCurrentStatePartial.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', this.getCurrentStatePartial.bind(this))
      .on('set', this.setCurrentThermoState.bind(this));

    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemp.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('get', this.getCurrentTemp.bind(this))
      .on('set', this.setCurrentTemp.bind(this));


    this.service
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', this.getCurrentUnits.bind(this))


  } else {
    this.log("Unknown device type " + this.deviceType);
  }
  this.log("HttpMulti Initialization complete for " + this.deviceType + ":" + this.name + ":" + serialNum);
}

HttpMulti.prototype.getObstructed = function(callback) {
  this.log("getObstructed -> %s", this.lastObstructed);
  callback(null, this.lastObstructed);
}

HttpMulti.prototype.getCurrentPosition = function(callback) {
  this.log("getCurrentPosition -> %s", this.lastPosition);
  callback(null, this.lastState);
}

HttpMulti.prototype.getCurrentState = function(callback) {
  if (this.status_url == undefined) {
    this.log("getCurrentState -> %s", this.lastState);
    callback(null, this.lastState);
    return;
  }

  this.httpRequestNumericResponse(this.status_url, function(error, body) {
    if (error) {
      this.log("Warning, %s", error);
    } else {
      this.lastState = (parseInt(body) > 0);
      this.log("getCurrentState: Updated state to %s", this.lastState);
    }
    this.log("getCurrentState -> %s", this.lastState);
    callback(null, this.lastState);
  }.bind(this));
}

HttpMulti.prototype.getCurrentStatePartial = function(callback) {
  if (this.status_url == undefined) {
    this.log("getCurrentStatePartial -> %s", this.lastStatePartial);
    callback(null, this.lastStatePartial);
    return;
  }

  this.httpRequestNumericResponse(this.status_url, function(error, body) {
    if (error) {
      this.log("Warning, %s", error);
    } else {
      this.lastStatePartial = parseInt(body);
      this.log("getCurrentStatePartial: Updated state to %s", this.lastStatePartial);
    }
    this.log("getCurrentStatePartial -> %s", this.lastStatePartial);
    callback(null, this.lastStatePartial);
  }.bind(this));
}

HttpMulti.prototype.getCurrentUnits = function(callback) {
  this.log("getCurrentUnits -> %s", this.units);
  callback(null, this.units);
}

HttpMulti.prototype.getCurrentTemp = function(callback) {
  if (this.gettemp_url == undefined) {
    this.log("getCurrentTemp -> %s", this.lastTemp);
    callback(null, this.lastTemp);
    return;
  }

  this.httpRequestNumericResponse(this.gettemp_url, function(error, body) {
    if (error) {
      this.log("Warning, %s", error)
    } else {
      this.lastTemp = parseInt(body);
      this.log("getCurrentTemp: Updated temp to %s", this.lastTemp);
    }
    this.log("getCurrentTemp -> %s", this.lastTemp);
    callback(null, this.lastTemp);
  }.bind(this));
}

HttpMulti.prototype.getPositionState = function(callback) {
  this.log("getPositionState -> %s", this.currentPositionState);
  callback(null, this.currentPositionState);
}

HttpMulti.prototype.getTargetPosition = function(callback) {
  this.log("getTargetPosition -> %s", this.currentTargetPosition);
  callback(null, this.currentTargetPosition);
}

HttpMulti.prototype.setTargetPosition = function(pos, callback) {
  // 0 down, >0 up.
  this.currentTargetPosition = pos;
  const moveUp = (pos > 0);
  this.log("setTargetPosition(%s[=%s])", pos, moveUp ? "UP" : "DOWN");

  this.service
    .setCharacteristic(Characteristic.PositionState, (moveUp ? 1 : 0));

  this.httpRequest((moveUp ? this.up_url : this.down_url), function() {
    this.log("Success moving %s", (moveUp ? "up (to 100)" : "down (to 0)"))
    this.service
      .setCharacteristic(Characteristic.CurrentPosition, (moveUp ? 100 : 0));
    //        this.service
    //            .setCharacteristic(Characteristic.PositionState, 2);
    this.lastPosition = (moveUp ? 100 : 0);
    this.lastState = (moveUp ? 1 : 0);
    callback(null);
  }.bind(this));
}

HttpMulti.prototype.setTargetDoorPosition = function(pos, callback) {
  this.log("setTargetDoorPosition(%s[=%s])", pos, pos ? "DOWN" : "UP");
  this.currentTargetPosition = pos;
  //const moveUp = (this.currentTargetPosition >= this.lastPosition);

  this.httpRequest((pos ? this.down_url : this.up_url), function() {
    this.log("Success moving %s", (pos ? "down (to 0)" : "up (to 1)"));
    this.service
      .setCharacteristic(Characteristic.CurrentDoorState, pos);
    this.lastState = pos; //(pos ? 0 : 1 );
    callback(null);
  }.bind(this));
}

HttpMulti.prototype.setCurrentState = function(value, callback) {
  this.log("setCurrentState(%s[=%s])", value, value ? "ON" : "OFF");
  this.currentTargetState = value;
  if (this.partial == 1) {
    //It's a dim operation, so don't turn the light on
    this.log("Ignoring on since device is partially on");
    this.partial = 0;
    callback(null);
  } else {
    this.httpRequest((value ? this.on_url : this.off_url), function() {
      this.log("Success turning %s", (value ? "ON" : "OFF"));
      this.lastState = value;
      this.partial = 0;
      callback(null);
    }.bind(this));
  }
}

HttpMulti.prototype.setCurrentThermoState = function(value, callback) {
  this.log("setCurrentThermoState(%s)", value);
  this.currentTargetState = value;
  var myURL = this.mode_url;
  myURL = myURL.replace("%VALUE%", value);

  this.httpRequest(myURL, function() {
    this.log("Success setting %s", value)
    this.lastState = value;
    callback(null);
  }.bind(this));
}

HttpMulti.prototype.setCurrentTemp = function(value, callback) {
  this.log("setCurrentTemp(%s)", value);
  this.lastTemp = value;
  var myURL = this.mode_url;
  myURL = myURL.replace("%VALUE%", value);

  this.httpRequest(myURL, function() {
    this.log("Success setting temp %s", value)
    this.lastTemp = value;
    callback(null);
  }.bind(this));
}

HttpMulti.prototype.setCurrentStatePartial = function(value, callback) {
  this.log("setCurrentPartialState(%s)", value);
  this.currentTargetState = value;
  this.partial = 1;

  //	if (this.lastUpdate > (Date.now() + 1000)) {
  var myURL = this.brightness_url;
  if (myURL === undefined) {
    this.log("Error, brightness URL not defined!");
    callback("brightness_url not defined")
    return;
  } else {
    // replace %VALUE% with value in the URL
    myURL = myURL.replace("%VALUE%", value);
  }
  this.httpRequest(myURL, function() {
    this.log("Success turning %s", value)
    this.lastState = 1;
    this.lastStatePartial = value;
    this.partial = 0;
    callback(null);
  }.bind(this));
  this.lastUpdate = Date.now();
  //    } else {
  //      this.log("Brightness not changing due to throttle. Last update is: %s", this.lastUpdate);
  //    }
}

HttpMulti.prototype.setCurrentLockState = function(value, callback) {
  this.log("setLockState(%s[=%s])", value, value ? "LOCK" : "UNLOCK");
  this.currentTargetState = value;

  this.httpRequest((value ? this.lock_url : this.unlock_url), function() {
    this.log("Success turning to %s", (value ? "LOCK" : "UNLOCK"))
    this.lastState = value;
    var currentState = (value == Characteristic.LockTargetState.SECURED) ?
      Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;

    this.service.setCharacteristic(Characteristic.LockCurrentState, currentState);

    callback(null);
  }.bind(this));
}


HttpMulti.prototype.httpRequest = function(url, callback) {
  this.log("Requesting (%s): %s", this.httpMethod, url);
  request({
    method: this.httpMethodmethod,
    url: url,
  }, function(err, response, body) {
    if (err) {
      this.log("Error getting state: %s", err);
      callback(err, response, body);
    } else if (response.statusCode != 200) {
      this.log("Error getting state (status code %s): %s", response.StatusCode, err);
      callback(err, response, body);
    } else {
      callback(null, response, body);
    }
  }.bind(this));
}

HttpMulti.prototype.httpRequestNumericResponse = function(url, callback) {
  this.httpRequest(url, function(err, response, body) {
    if (err) {
      callback(err, null);
    } else if (body == undefined) {
      callback("body returned isn't defined", null);
    } else if (isNaN(parseFloat(body)) || !isFinite(body)) {
      callback("status returned isn't numeric: " + body, null);
    } else {
      callback(null, parseInt(body));
    }
  }.bind(this));
}

HttpMulti.prototype.getServices = function() {
  return [this.informationService, this.service];
}