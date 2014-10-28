/*global window:false, console:false, document:false, event:false, jQuery:false */

/***********************************************************************************

author:		Daniel Kazmer - http://iframework.net
created:	24.11.2012
version:	2.0.0

	version history:
		2.0.0	major improvements in code structure, stability, accuracy; changed color shift property (see usage); added windows phone support; added retina image handling (20.10.2014)
		1.10.0	added keyboard functionality (03.01.2014)
		1.9.1	bug fix: when button is pressed but released off button, button action now gets cleared (19.12.2013)
		1.9.0	added -/+ buttons, along with the onButton and onload callbacks (18.12.2013)
		1.8.8	stability (some distortion resistance); better rebuild on mobile; mobile orientation change support (09.12.2013)
		1.8.7	snap marks now align to snap points; bug fix: vertical now rebuilds properly (03.12.2013)
		1.8.5	mobile ready; added onSnap callback (02.12.2013)
		1.7.1	added real snapping and reworked its options; added "destroy" method - now allows clean rebuild; bug fix: when shell is thinner than knob, knob didn't retain its position in vertical mode (28.11.2013)
		1.5.0	added loadbar capability and "animated" option (27.11.2013)
		1.0.0	added Vertical mode; added option to hide knob (26.11.2013)
		0.3.1	more accurate snap markers; added color shifting (25.07.2013)
		0.2.6	bug fix: constraints when dragging (20.12.2012)
		0.2.5	bug fix: when knob is image, startAt now gets the correct knob width (13.12.2012)
		0.2.0:	added disabled state (08.12.2012)
		0.1.0:	created

	usage:
		pass an empty DIV, my_element, with a unique id to the following class

		var my_sGlide_instance = new sGlide(my_element, {
			startAt: 60,			// start slider knob at - default: 0
			image: ''				// string - image path
			retina: true,			// boolean - larger knob image with suffix @2x for retina displays
			width: 200,				// integer - default: 100
			height: 20,				// integer - default: 40
			unit: 'px',				// 'px' or '%' (default)
			pill:					// boolean - default: true
			snap: {
				markers		: false,
				hard		: false,
				onlyOnDrop	: false,
				points		: 0
			},
			disabled:				// boolean - default: false
			colorShift:				// array of 2 css color values
			vertical:				// boolean - default: false
			showKnob:				// boolean - default: true
			buttons:				// boolean - default: false
			drop/drag/onSnap/onButton/onload: function(o){
				console.log('returned object',o);
			}
		});

		all properties are optional, however, to retrieve data, use one of the callbacks

	goals:
		- if unit is %, then markers should be also
		- get color shifting to work with the startAt method (start at correct color)
		- old browsers verticals (IE6/7 - low priority)
		- fix bug: rebuilding vertical rotates again
		- range selector
		- fixes or implementations of these issues: http://stackoverflow.com/search?q=sglide

***********************************************************************************/

function sGlide(self, options){

	//------------------------------------------------------------------------------------------------------------------------------------
	// global variables

	var knob		= null,
		follow		= null,
		startAt		= 0,
		img			= '',
		imgLoaded	= false,
		isMobile	= false,
		buttons		= false,
		keyCtrl		= false,
		// events
		eventDocumentMouseUp	= null,
		eventDocumentMouseMove	= null,
		eventDocumentMouseDown	= null,
		eventDocumentKeyUp		= null,
		eventDocumentKeyDown	= null,
		eventKnobMouseUp		= null,
		eventKnobMouseDown		= null,
		eventWindowResize		= null,
		eventBarMouseDown		= null,
		eventPlusMouseUp		= null,
		eventPlusMouseDown		= null,
		// event states prelim
		mEvt	= {
			'down'	: 'mousedown',
			'up'	: 'mouseup',
			'move'	: 'mousemove'
		};

	//------------------------------------------------------------------------------------------------------------------------------------
	// public methods

	this.destroy = function(){
		var guid = self.getAttribute('id');

		// unwrap vertical buttons
		var vertContainer = get('#'+guid+'_vert-marks');
		if (vertContainer){
			vertContainer.parentNode.insertBefore(self, vertContainer.nextSibling);
			vertContainer.remove();
		}

		var markers = get('#'+guid+'_markers');
		if (markers) markers.remove();

		if (isMobile){
			document.removeEventListener(mEvt.down, eventDocumentMouseDown);
		} else if (keyCtrl){
			document.removeEventListener('keydown', eventDocumentKeyDown);
			document.removeEventListener('keyup', eventDocumentKeyUp);
		}

		// remove buttons
		if (buttons){
			var plus = get('#'+guid+'_plus'), minus = get('#'+guid+'_minus');
			plus.removeEventListener(mEvt.up);
			plus.removeEventListener(mEvt.down);
			minus.removeEventListener(mEvt.up);
			minus.removeEventListener(mEvt.down);
			plus.remove();
			minus.remove();
			// unwrap
			if (!vertContainer){
				var buttonsContainer = get('#'+guid+'_button-marks');
				if (buttonsContainer){
					buttonsContainer.parentNode.insertBefore(buttonsContainer.childNodes[0], buttonsContainer.nextSibling);
					buttonsContainer.remove();
				}
			}
		}

		// windows phone touch events
		if (window.navigator.msPointerEnabled){
			document.removeEventListener(mEvt.msup, eventDocumentMouseUp);
			document.removeEventListener(mEvt.msmove, eventDocumentMouseMove);
			self.removeEventListener(mEvt.msdown, eventBarMouseDown);
			follow.removeEventListener(mEvt.msdown, eventBarMouseDown);
			knob.removeEventListener(mEvt.msdown, eventKnobMouseDown);
			knob.removeEventListener(mEvt.msup, eventKnobMouseDown);
		}

		document.removeEventListener(mEvt.move, eventDocumentMouseMove);
		document.removeEventListener(mEvt.up, eventDocumentMouseUp);
		window.removeEventListener('resize', eventWindowResize);
		window.removeEventListener('orientationchange', eventWindowResize);
		self.removeEventListener(mEvt.down, eventBarMouseDown);
		knob.removeEventListener(mEvt.up, eventKnobMouseUp);
		knob.removeEventListener(mEvt.down, eventKnobMouseDown);
		knob.remove();
		follow.removeEventListener(mEvt.down, eventBarMouseDown);
		follow.remove();
		self.removeAttribute('style');
		self.removeAttribute('data-state');

		for (var i in this) delete this[i];
	};

	this.startAt = function(pct){
		startAt = pct;
		
		// set pixel positions
		var selfWidth = self.offsetWidth;
		var knobWidth = knob.offsetWidth;

		// constraints
		if (pct <= 0)			pct = 0;
		else if (pct >= 100)	pct = 100;

		// set pixel positions
		var px = (selfWidth - knobWidth) * pct / 100 + (knobWidth / 2);
		var pxAdjust = px - (knobWidth / 2);

		// gui
		knob.style.left = pxAdjust+'px';
		follow.style.width = px+'px';

		return this;
	};

	//------------------------------------------------------------------------------------------------------------------------------------
	// private global functions

	function get(id){
		switch (id[0]){
			case '#':	return document.getElementById(id.substr(1));
			case '.':	return document.getElementsByClassName(id.substr(1));
			default:	return document.getElementsByTagName(id);
		}
	}

	function wrapAll(elements, wrapperStr){
		// set wrapper element
		var a = document.createElement('div');
		a.innerHTML = wrapperStr;
		var wrapperEl = a.childNodes[0];
		elements[0].parentNode.insertBefore(wrapperEl, elements[0]);

		// append it
		for (var i = 0; i < elements.length; i++) wrapperEl.appendChild(elements[i]);
	}

	function clone(obj){
		if (obj === null || typeof(obj) != 'object') return obj;

		var temp = obj.constructor(); // changed

		for (var key in obj){
			if (obj.hasOwnProperty(key)){
				temp[key] = clone(obj[key]);
			}
		}

		return temp;
	}

	function extend(a, b, isCss){
		var c = isCss ? b : {};
		// for (var p in a) c[p] = (b[p] == null) ? a[p] : b[p];
		for (var p in a){
			if (b[p] instanceof Array){
				c[p] = [];
				for (var i = 0; i < b[p].length; i++){
					if (typeof b[p][i] == 'object') extend(a[p][i], b[p][i]);
					else c[p].push(b[p][i]);
				}
			}
			else if (typeof b[p] == 'object') c[p] = extend(a[p], b[p]);
			else c[p] = (b[p] === undefined) ? a[p] : b[p];
		}

		return c;
	}

	function css(el, styles, prefixes){
		var existingArr	= (el.getAttribute('style') ? el.getAttribute('style').split(';') : []),
			existingObj	= {},
			stl			= null;

		// create browser prefixes
		if (prefixes){
			var temp = {};
			for (var key in styles){
				if (styles.hasOwnProperty(key)){
					for (var i = 0; i < prefixes.length; i++){
						temp[prefixes[i]+key] = styles[key];
					}
				}
			}
			styles = temp;
		}

		// create string
		for (var i = 0; i < existingArr.length; i++){
			stl = existingArr[i].split(':');
			if (stl.length < 2) break;
			existingObj[stl[0].trim()] = stl[1].trim();
		}

		// format and set style
		if (Object.keys(existingObj).length === 0) existingObj = styles;
		var str = JSON.stringify(extend(existingObj, styles, true)).replace(/\{*\}*"*/g, '').replace(/,/g, '; ') || '';
		el.setAttribute('style', str.trim());
	}

	(function(document, that, $){

		//------------------------------------------------------------------------------------------------------------------------------------
		// validate

		if (self instanceof Element === false) throw new Error('sGlide: first param expected object<Element>, found '+(typeof self));
		if (options instanceof Object === false) throw new Error('sGlide: second param expected object, found '+(typeof options));

		//------------------------------------------------------------------------------------------------------------------------------------
		// build skeleton

		var guid = self.id;

		// no id? give one!
		if (!guid) guid = self.id = 'sglide-'+Math.random(1, 999);

		// add assets
		self.innerHTML = '<div class="follow_bar"></div><div class="slider_knob"></div>';

		if (self.childNodes[0].className == 'slider_knob'){
			knob = self.childNodes[0];
			follow = self.childNodes[1];
		} else {
			knob = self.childNodes[1];
			follow = self.childNodes[0];
		}

		//------------------------------------------------------------------------------------------------------------------------------------
		// settings & variables

		var settings = extend({
			'startAt'		: 0,
			'image'			: 'none',	// full path of image
			'height'		: 40,
			'width'			: 100,
			'unit'			: '%',	// 'px' or '%'
			'pill'			: true,
			'snap'			: {
				'markers'	: false,
				'hard'		: false,
				'onlyOnDrop': false,
				'points'	: 0
			},
			'disabled'		: false,
			'colorShift'	: [],
			'vertical'		: false,
			'showKnob'		: true,
			'buttons'		: false,
			'retina'		: true
		}, options);

		self.removeAttribute('style');	// remove user inline styles

		var uAgent = navigator.userAgent;

		if (uAgent.match(/Android/i) ||
			uAgent.match(/webOS/i) ||
			uAgent.match(/iPhone/i) ||
			uAgent.match(/iPad/i) ||
			uAgent.match(/iPod/i) ||
			// uAgent.match(/Windows Phone/i) ||
			uAgent.match(/BlackBerry/i)){
			isMobile = true;
			mEvt.down = 'touchstart'; mEvt.up = 'touchend'; mEvt.move = 'touchmove';
			var touchX = null, touchY = null;
		} else if (uAgent.match(/Windows Phone/i)){
			if (window.navigator.msPointerEnabled){
				css(self, {'-ms-touch-action': 'none'});
				mEvt.msdown = 'MSPointerDown'; mEvt.msup = 'MSPointerUp'; mEvt.msmove = 'MSPointerMove';
			} else {
				mEvt.down = 'touchstart'; mEvt.up = 'touchend'; mEvt.move = 'touchmove';
			}
		}

		// local variables
		var THE_VALUE		= settings.startAt,
			result			= 0,
			vert			= settings.vertical,
			markers			= (settings.snap.points > 0 && settings.snap.points <= 9 && settings.snap.markers),
			knob_bg			= '#333',
			knob_width		= (settings.showKnob ? '2%' : '0'),
			self_height		= Math.round(settings.height)+'px',
			knob_height		= 'inherit',
			r_corners		= settings.pill,
			imageBln		= (settings.image != 'none' && settings.image !== '' && !settings.disabled) ? true : false,
			colorChangeBln	= (settings.colorShift.length > 1) ? true : false,
			retina			= (window.devicePixelRatio > 1) && settings.retina,
			MSoffsetTop		= null;
			
		keyCtrl				= (self.getAttribute('data-keys') == 'true') ? true : false;
		buttons				= settings.buttons;

		//------------------------------------------------------------------------------------------------------------------------------------
		// image handling

		if (imageBln){	// if image
			img = settings.image;

			// retina handling
			if (retina){
				var rImgTemp = img.split('.');
				var rImgTemp_length = rImgTemp.length;

				rImgTemp[rImgTemp_length-2] = rImgTemp[rImgTemp_length-2] + '@2x';
				img = '';
				for (var i = 0; i < rImgTemp_length; i++){
					img += rImgTemp[i] + ((i < rImgTemp_length-1) ? '.' : '');
				}
			}

			knob.innerHTML = '<img src="'+img+'" style="visibility:hidden" />';
			var imgEl = knob.childNodes[0];
			imgEl.onload = function(){
				imgLoaded = true;

				if (retina){
					imgEl.style.width = (imgEl.offsetWidth / 2) + 'px';
					// imgEl.style.height = (imgEl.offsetHeight / 2) + 'px';
				}
				
				css(knob, {'width': 'auto'});

				var thisHeight = imgEl.offsetHeight;
				knob_width = imgEl.offsetWidth+'px';
				knob_height = thisHeight+'px';
				
				knob_bg = 'url('+img+') no-repeat';
				var knob_bg_styles = {
					'width': knob_width,
					'height': knob_height,
					'background': knob_bg
				};
				if (retina) knob_bg_styles['background-size'] = '100%';

				css(knob, knob_bg_styles);
				css(follow, {
					'height': knob_height,
					'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0px'
				});
				css(self, {
					'height': knob_height,
					'border-radius': r_corners ? thisHeight / 2 + 'px' : '0px'
				});

				imgEl.parentNode.removeChild(imgEl);

				if (thisHeight > settings.height){
					var knobMarginValue = (thisHeight-settings.height)/2;
					css(self, {
						// 'margin-top': knobMarginValue+'px',
						'height': settings.height+'px'
					});
					css(knob, {
						'top': '-'+knobMarginValue+'px'
					});
					css(follow, {
						'height': settings.height+'px',
						'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0px'
					});
				} else {
					// children stay inside parent
					css(self, {'overflow': 'hidden'});
				}
			};
		} else {
			imgLoaded = true;
			var d = settings.height / 2;
			css(self, {'border-radius': (r_corners ? d+'px' : '0'), 'overflow': 'hidden'});
			css(follow, {'border-radius': (r_corners ? d+'px 0 0 '+d+'px' : '0')});
		}

		var unit = settings.unit, width = settings.width;
		if (unit != 'px' && unit != '%') unit = '%';
		else if (unit == 'px') width = Math.round(width);
		else if (unit == '%' && Math.round(width) > 100) width = 100;

		//------------------------------------------------------------------------------------------------------------------------------------
		// styles

		var cssPrefixes = [
				'-webkit-',
				'-khtml-',
				'-moz-',
				'-ms-',
				'-o-',
				''
			],
			cssBorderBox	= {'box-sizing': 'border-box'},
			cssContentBox	= {'box-sizing': 'content-box'},
			cssUserSelect	= {'user-select': 'none'},
			cssRotate		= {'transform': 'rotate(-90deg)'};

		css(self, {
			'width': width + unit,
			'height': self_height,
			'text-align': 'left',
			'margin': 'auto',
			'cursor': (!settings.disabled ? 'pointer' : 'default'),
			'z-index': '997',
			'position': 'relative',
			'-webkit-touch-callout': 'none'
		});
		css(self, clone(cssContentBox), cssPrefixes);
		css(self, clone(cssUserSelect), cssPrefixes);

		css(knob, {
			'width': knob_width,
			'background': knob_bg,
			'height': knob_height,
			'display': (!settings.disabled ? 'inline-block' : 'none'),
			'font-size': '0',
			'position': 'relative',
			'z-index': '999'
		});
		css(knob, clone(cssContentBox), cssPrefixes);

		css(follow, {
			'position': (!settings.disabled ? 'absolute' : 'static'),	// static when 'disabled' for self.overflow.hidden to work in Chrome
			'height': 'inherit',//knob.offsetHeight+'px',
			'width': '0',
			'z-index': '998'
		});
		css(follow, clone(cssContentBox), cssPrefixes);

		if (vert) var vertWidth = self.offsetWidth;

		//------------------------------------------------------------------------------------------------------------------------------------
		// snap marks, buttons, vertical

		// snap to
		var snapping_on = false;
		var snaps = Math.round(settings.snap.points);
		var snapPctValues = [0];
		var drawSnapmarks = function(resize){
			if (snaps === 1) snaps = 2;
			
			// pixels
			var kw = knob.offsetWidth;
			var w = self.offsetWidth - kw;
			var increment = w / (snaps - 1);
			var snapValues = [0];
			var step = increment;
			while (step <= w+2){	// added 2px to fix glitch when drawing last mark at 7 or 8 snaps (accounts for decimal)
				snapValues.push(step);
				step += increment;
			}
			// percentage
			increment = 100 / (snaps - 1);
			step = increment;
			while (step <= 101){	// added 1% to fix glitch when drawing last mark at 7 or 8 snaps (accounts for decimal)
				snapPctValues.push(step);
				step += increment;
			}

			snapping_on = true;

			// markers
			if (markers){
				if (!resize){
					// self.parentNode.insertBefore('<div id="'+guid+'_markers"></div>', self.nextSibling);
					self.insertAdjacentHTML('afterend', '<div id="'+guid+'_markers"></div>');
					
					var marks = $('#'+guid+'_markers');
					
					css(marks, {
						'width': self.offsetWidth+'px', //settings.width + unit,
						'margin': 'auto',
						'padding-left': (kw/2)+'px',
						'-webkit-touch-callout': 'none'
					});
					css(marks, {'box-sizing': 'border-box'}, cssPrefixes);
					css(marks, {'user-select': 'none'}, cssPrefixes);
				} else {
					var marks = $('#'+guid+'_markers');
					marks.innerHTML = '';
				}

				var str = '';

				for (var i = 0; i < snapValues.length; i++)
					str += '<div style="display:inline-block; width:0; height:5px; border-left:#333 solid 1px; position:relative; left:'+
						(snapValues[i]-i)+'px; float:left"></div>';

				marks.innerHTML = str;
			}
		};

		// -----------

		// vertical
		var verticalTransform = function(){
			if (markers && snaps > 0 && snaps < 10){
				var a = [self, $('#'+guid+'_markers')];

				wrapAll(a, '<div id="'+guid+'_vert-marks" style="margin:0; z-index:997; width:'+width+unit+
					'; -webkit-backface-visibility:hidden; -moz-backface-visibility:hidden; -ms-backface-visibility:hidden; backface-visibility:hidden"></div>');

				var vmarks = $('#'+guid+'_vert-marks');

				css(self, {'width': '100%'});
				css(vmarks, clone(cssContentBox), cssPrefixes);
				css(vmarks, clone(cssRotate), cssPrefixes);
				css(vmarks, {'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'});
				css(vmarks, {'transform-origin': vertWidth+'px 0'}, cssPrefixes);

				for (var i = 0; i < a.length; i++)
					css(a[i], {'margin': '0'});
			} else {
				// check whether even by even or odd by odd to fix blurred elements
				css(self, {'margin': '0', 'top': '0', 'left': '0'});
				css(self, {'backface-visibility': 'hidden'}, cssPrefixes);
				css(self, clone(cssRotate), cssPrefixes);
				css(self, {'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'});
				css(self, {'transform-origin': vertWidth+'px 0'}, cssPrefixes);
			}
		};

		// -----------

		// buttons
		var drawButtons = function(){
			knob_adjust = knob.offsetWidth / self.offsetWidth * 50;

			var vertStyles	= '; z-index:1000; position:relative; top:30px',
				plusStr		= '<div class="sglide-buttons" id="'+guid+'_plus" style="display:inline-block; cursor:pointer'+(vert ? vertStyles : '')+'">&nbsp;+&nbsp;</div>',
				minusStr	= '<div class="sglide-buttons" id="'+guid+'_minus" style="display:inline-block; cursor:pointer'+(vert ? vertStyles : '')+'">&nbsp;&minus;&nbsp;</div>';

			if (markers){
				if (!vert){
					css(self, {'width': 'auto'});
					var a = (vert) ? [$('#'+guid+'_vert-marks')] : [$('#'+guid), $('#'+guid+'_markers')];
					wrapAll(a, '<div id="'+guid+'_button-marks" style="display:inline-block; vertical-align:middle; width:'+width+unit+'"></div>');
					var q = $('#'+guid+'_button-marks');
				} else {
					var q = $('#'+guid+'_vert-marks');
				}

				q.insertAdjacentHTML('afterend', plusStr);
				q.insertAdjacentHTML('beforebegin', minusStr);
			} else {
				css(self, {
					'display': (!vert) ? 'inline-block' : 'block',
					'vertical-align': 'middle'
				});

				self.insertAdjacentHTML('afterend', plusStr);
				self.insertAdjacentHTML('beforebegin', minusStr);
			}

			var plusBtn		= $('#'+guid+'_plus'),
				minusBtn	= $('#'+guid+'_minus');

			css(minusBtn, clone(cssUserSelect), cssPrefixes);
			css(plusBtn, clone(cssUserSelect), cssPrefixes);

			if (!settings.disabled){
				plusBtn.addEventListener(mEvt.down, function(){
					btn_is_down = true;
					btnTriggers('>');
					btn_timers = setTimeout(function(){
						btnHold('>');
					}, 500);
				});
				plusBtn.addEventListener(mEvt.up, btnClearAction);

				minusBtn.addEventListener(mEvt.down, function(){
					btn_is_down = true;
					btnTriggers('<');
					btn_timers = setTimeout(function(){
						btnHold('<');
					}, 500);
				});
				minusBtn.addEventListener(mEvt.up, btnClearAction);
			}
		}, btnTriggers = function(direction, smoothBln){
			// if startAt changed on instance
			if (startAt !== null && THE_VALUE !== startAt) THE_VALUE = startAt;

			startAt = null;

			var set_value = THE_VALUE;
			if (btn_snap){
				var intvl = 100 / (settings.snap.points - 1);
				var p = intvl;
				for (var i = 0; i < settings.snap.points; i++){
					if (intvl >= THE_VALUE){
						if (direction == '>')	THE_VALUE = (Math.round(intvl) > Math.round(THE_VALUE) ? intvl : intvl+p);
						else					THE_VALUE = intvl-p;
						break;
					} else intvl += p;
				}
			} else {
				if (direction == '>')	THE_VALUE+=(smoothBln ? 1 : 10);
				else					THE_VALUE-=(smoothBln ? 1 : 10);
			}

			set_value = THE_VALUE;	// leave THE_VALUE out of visual adjustments

			// constraints
			if ((THE_VALUE+knob_adjust) > 100)	{ THE_VALUE = 100; set_value = 100 /*- knob_adjust*/; }
			else if (THE_VALUE-knob_adjust < 0)	{ THE_VALUE = 0; set_value = 0 /*+ knob_adjust*/; }

			// set pixel positions
			var px = (self.offsetWidth - knob.offsetWidth) * set_value / 100 + (knob.offsetWidth / 2);
			var pxAdjust = px - knob.offsetWidth / 2;

			// gui
			knob.style.left = pxAdjust+'px';// (set_value-knob_adjust)+'%';
			follow.style.width = px+'px';// set_value+'%';
			if (colorChangeBln) colorChange(set_value);

			// output
			if (options.onButton) options.onButton({'id':guid, 'value':THE_VALUE, 'el':self});
		}, btnHold = function(dir){
			var btnHold_timer = setInterval(function(){
				if (btn_is_down) btnTriggers(dir, true);
				else clearInterval(btnHold_timer);
			}, (btn_snap ? 201 : 10));
		}, btnClearAction = function(){
			btn_is_down = false;
			clearTimeout(btn_timers);
		}, knob_adjust = 0, btn_is_down = false, btn_timers = null;
		var btn_snap = (settings.snap.points > 0 && settings.snap.points <= 9 && (settings.snap.hard || settings.snap.onlyOnDrop));

		//------------------------------------------------------------------------------------------------------------------------------------
		// events

		// knob
		var is_down = false;

		eventKnobMouseDown = function(){
			is_down = true;
			self.setAttribute('data-state', 'active');
		};
		eventKnobMouseUp = function(){
			is_down = false;
		};

		knob.addEventListener(mEvt.down, eventKnobMouseDown);
		knob.addEventListener(mEvt.up, eventKnobMouseUp);

		// snapping
		var storedSnapValue = 's-1';
		var doSnap = function(kind, m){
			if (snaps > 0 && snaps < 10){	// min 1, max 9
				var knobWidth = knob.offsetWidth;
				var selfWidth = self.offsetWidth;
				// var pctFive = selfWidth / 20 + 10;
				var pctFive = selfWidth * (10-snaps) / 100 - 2;

				// % to px
				var snapPixelValues = [];
				for (var j = 0; j < snapPctValues.length; j++){
					snapPixelValues.push((selfWidth - knobWidth) * snapPctValues[j] / 100);
				}

				// get closest px mark, and set %
				var closest = null, pctVal = 0;
				for (var i = 0; i < snapPixelValues.length; i++) {
					if (closest === null || Math.abs(snapPixelValues[i] - m) < Math.abs(closest - m)){
						closest = snapPixelValues[i];
						pctVal = snapPctValues[i];
					}
				}

				// physically snap it
				if (kind == 'drag'){
					if (settings.snap.hard){
						knob.style.left = closest+'px';
						follow.style.width = closest+knobWidth/2+'px';
						doOnSnap(closest, pctVal);
					} else {
						if (Math.round(Math.abs(closest - m)) < pctFive){
							knob.style.left = closest+'px';
							follow.style.width = closest+knobWidth/2+'px';
							doOnSnap(closest, pctVal);
						} else storedSnapValue = 's-1';
					}
				} else {
					knob.style.left = closest+'px';
					follow.style.width = closest+knobWidth/2+'px';
					return closest;
				}
			}
		}, doOnSnap = function(a, b){ // callback: onSnap
			if (options.onSnap && 's'+a !== storedSnapValue){
				storedSnapValue = 's'+a;
				options.onSnap({'id':guid, 'value':b, 'el':self});
			}
		};

		// keyboard controls
		if (!isMobile && keyCtrl){
			var keycode, keydown = false,
				codeBack	= (vert) ? 40 : 37,
				codeFwd		= (vert) ? 38 : 39;

			eventDocumentKeyDown = function(e){
				if (!keydown && !settings.disabled){
					if (window.event) keycode = window.event.keyCode;
					else if (e) keycode = e.which;

					if (keycode == codeBack){
						btn_is_down = true;
						btnTriggers('<');
						btn_timers = setTimeout(function(){
							btnHold('<');
						}, 500);
					} else if (keycode == codeFwd){
						btn_is_down = true;
						btnTriggers('>');
						btn_timers = setTimeout(function(){
							btnHold('>');
						}, 500);
					}
					keydown = true;
				}
			};
			eventDocumentKeyUp = function(){
				keydown = false;
				btnClearAction();
			};

			document.addEventListener('keydown', eventDocumentKeyDown);
			document.addEventListener('keyup', eventDocumentKeyUp);
		}

		if (isMobile){
			eventDocumentMouseDown = function(e){
				// is_down = false;
				touchX = e.targetTouches[0].pageX;
				touchY = e.targetTouches[0].pageY;
			};
			document.addEventListener(mEvt.down, eventDocumentMouseDown);
		}
		if (isMobile || uAgent.match(/Windows Phone/i)){
			// orientation
			window.addEventListener('orientationchange', eventWindowResize);
		}

		eventDocumentMouseMove = function(e){
			e = e || event;	// ie fix

			var x			= null,
				selfWidth	= self.offsetWidth,
				knobWidth	= knob.offsetWidth;

			// MS bug: manually set offsetTop
			if (window.navigator.msPointerEnabled && MSoffsetTop === null) MSoffsetTop = self.getBoundingClientRect().top;

			if (vert){
				var base = (MSoffsetTop !== null ? MSoffsetTop : self.offsetTop) + selfWidth;
				if (isMobile){
					touchY = e.targetTouches[0].pageY;
					x = base - touchY;
				} else x = base - e.pageY;
			} else {
				if (isMobile){
					touchX = e.targetTouches[0].pageX;
					x = touchX - self.offsetLeft;
				} else x = e.pageX - self.offsetLeft;
			}

			var stopper = knobWidth / 2;
			var m = x - stopper;
			if (is_down){
				e.stopPropagation();
				e.preventDefault();
				// if(event.preventDefault) event.preventDefault();
				if (e.returnValue) e.returnValue = false;

				// constraint
				if (x <= stopper){
					knob.style.left = '0px';
					follow.style.width = stopper+'px';
				} else if (x >= selfWidth-stopper){
					knob.style.left = (selfWidth-knobWidth)+'px';
					follow.style.width = (selfWidth-stopper)+'px';
				} else {
					knob.style.left = (x-stopper)+'px';
					follow.style.width = x+'px';
					if (!settings.snap.onlyOnDrop) doSnap('drag', m);
				}
			}

			result = knob.style.left;
			result = result.replace('px', '');

			// update values
			if (options.drag && self.getAttribute('data-state') == 'active')
				options.drag(updateME(getPercent(result)));

			// color change
			if (colorChangeBln && self.getAttribute('data-state') == 'active')
				colorChange(getPercent(result));
		};
		eventDocumentMouseUp = function(e){
			is_down = false;
			if (self.getAttribute('data-state') == 'active'){
				e = e || event;	// ie fix
				var x = null, base = 0, selfWidth = self.offsetWidth;

				if (vert){
					// base = self.offsetTop + selfWidth;
					base = (!window.navigator.msPointerEnabled ? self.offsetTop : self.getBoundingClientRect().top) + selfWidth;
					x = base - ((!isMobile ? e.pageY : touchY)-2);
				} else x = (!isMobile ? e.pageX : touchX) - self.offsetLeft;
				
				var knobWidth	= knob.offsetWidth;
				var stopper		= knobWidth / 2;
				var m			= x - stopper;	// true position of knob

				// snap to
				if (snaps > 0 && snaps < 10 && (settings.snap.onlyOnDrop || settings.snap.hard))	// min 1, max 9
					result = doSnap('drop', m);
				else {
					var mm	= knob.offsetLeft,
						mq	= selfWidth - knobWidth;

					// constraint
					if (mm <= 0){
						knob.style.left = '0px';
						follow.style.width = stopper+'px';
					} else if (mm >= mq){
						knob.style.left = mq+'px';
						follow.style.width = (selfWidth-stopper)+'px';
					}

					result = knob.style.left.replace('px', '');
				}

				if (options.drop) options.drop(updateME(getPercent(result)));
				if (options.drag && self.getAttribute('data-state') == 'active') options.drag(updateME(getPercent(result)));
				self.setAttribute('data-state', 'inactive');

				// color change
				if (colorChangeBln) colorChange(getPercent(result));
			}

			// if button pressed but released off button, clear button action
			if (btn_is_down) btnClearAction();
		};

		eventWindowResize = function(){
			that.startAt(startAt);
			if (markers) drawSnapmarks(true);
		};

		document.addEventListener(mEvt.move, eventDocumentMouseMove);
		document.addEventListener(mEvt.up, eventDocumentMouseUp);
		window.addEventListener('resize', eventWindowResize);

		//------------------------------------------------------------------------------------------------------------------------------------
		// functions

		var getPercent = function(o){
			o = parseFloat(o, 10);

			// calculate percentage
			var pct = o / (self.offsetWidth - knob.offsetWidth) * 100;
			THE_VALUE = startAt = pct;

			return pct;
		};

		var updateME = function(o){
			if (self.getAttribute('data-state') == 'active'){
				return {'id':guid, 'value':o, 'el':self};
			}
		};

		// color change
		var colorShiftInit = function(){
			var selfHeightHalf = self.offsetHeight / 2;
			var borderRadius = 'border-radius: '+(r_corners ? selfHeightHalf + 'px 0 0 ' + selfHeightHalf + 'px' : '0px');
			css(follow, {
				'overflow': 'hidden',
				'background-color': settings.colorShift[0]
			});

			follow.innerHTML = '<div style="opacity:'+(settings.startAt/100)+'; height:100%; background-color:'+settings.colorShift[1]+'; "></div>';
		}
		var colorChange = function(o){
			// css(follow.childNodes[0], {'opacity': ''+(o/100)});
			follow.childNodes[0].style.opacity = o / 100;
		};

		var eventBarMouseDown = function(e){
			e = e || event;	// ie fix
			if (e.returnValue) e.returnValue = false;	// wp

			is_down = true;
			self.setAttribute('data-state', 'active');

			if (!isMobile && !settings.snap.onlyOnDrop){
				var selfWidth = self.offsetWidth;
				var knobWidth = knob.offsetWidth;
				var x = null;
				if (vert){
					var base = self.offsetTop + selfWidth;
					x = base - (e.pageY-2);
				} else x = e.pageX - self.offsetLeft;
				var m = x - (knobWidth / 2);	// true position of knob

				knob.style.left = m+'px';
				follow.style.width = m+(knobWidth/2)+'px';
				
				// constraint
				if (m < 0) knob.style.left = '0px';
				else if (m >= selfWidth-knobWidth) knob.style.left = (selfWidth-knobWidth)+'px';
			}
		};

		if (!settings.disabled){
			self.addEventListener(mEvt.down, eventBarMouseDown);
			follow.addEventListener(mEvt.down, eventBarMouseDown);
		}

		//------------------------------------------------------------------------------------------------------------------------------------
		// start

		var setStartAt = function(num){
			startAt = (num) ? num : settings.startAt;

			if (isMobile) css(knob, {'position': 'relative', 'z-index': '999'});	// iPad style patch

			that.startAt(startAt);

			var rlt = {'id':guid, 'value':startAt, 'el':self};
			if (options.drop) options.drop(rlt);
			if (options.drag) options.drag(rlt);

			// inits
			if (snaps > 0 && snaps < 10) drawSnapmarks();
			if (vert) verticalTransform();
			if (buttons) drawButtons();
			if (colorChangeBln){
				colorShiftInit();
				colorChange(startAt);
			}
		};

		var onload_timer = setInterval(function(){
			if (imgLoaded){
				setStartAt(startAt);
				if (options.onload) options.onload();
				clearInterval(onload_timer);
			}
		}, 1);
	})(document, this, get);
}