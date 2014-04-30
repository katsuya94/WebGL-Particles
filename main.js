/* jshint strict: false */
/* global gl: true, Stats, createProgram, vec3, mat4 */
/* exported main */

var NUM_PARTICLES			= Math.pow(128, 2);
var NUM_SLOTS				= 2;
var PARTICLES_PER_ROW		= Math.sqrt(NUM_PARTICLES);
var STATE_TEXTURE_WIDTH		= PARTICLES_PER_ROW * NUM_SLOTS;
var STATE_TEXTURE_HEIGHT	= PARTICLES_PER_ROW;

function main() {
	var canvas = document.getElementById('webgl');
	gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
	if (!gl.getExtension('OES_texture_float')) {
		return;
	}

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.enable(gl.DEPTH_TEST);

	// Stats
	var stats = new Stats();
	stats.domElement.style.position	= 'fixed';
	stats.domElement.style.right	= '20px';
	stats.domElement.style.top		= '20px';
	document.body.appendChild(stats.domElement);

	var program_phys = createProgram(
		document.getElementById('phys-vs').text,
		document.getElementById('phys-fs').text);
	var program_calc = createProgram(
		document.getElementById('calc-vs').text,
		document.getElementById('calc-fs').text);
	var program_slvr = createProgram(
		document.getElementById('slvr-vs').text,
		document.getElementById('slvr-fs').text);
	var program_draw = createProgram(
		document.getElementById('draw-vs').text,
		document.getElementById('draw-fs').text);

	// Uniforms
	program_phys.u_dt		= gl.getUniformLocation(program_phys, 'u_dt');
	program_calc.u_dt		= gl.getUniformLocation(program_calc, 'u_dt');
	program_phys.u_viewport	= gl.getUniformLocation(program_phys, 'u_viewport');
	program_calc.u_viewport	= gl.getUniformLocation(program_calc, 'u_viewport');
	program_slvr.u_viewport	= gl.getUniformLocation(program_slvr, 'u_viewport');

	program_phys.u_state	= gl.getUniformLocation(program_phys, 'u_state');
	program_calc.u_state	= gl.getUniformLocation(program_calc, 'u_state');
	program_phys.u_dot		= gl.getUniformLocation(program_phys, 'u_dot');
	program_calc.u_dot		= gl.getUniformLocation(program_calc, 'u_dot');
	program_draw.u_state	= gl.getUniformLocation(program_draw, 'u_state');
	program_slvr.u_dot1		= gl.getUniformLocation(program_slvr, 'u_dot1');
	program_slvr.u_dot2		= gl.getUniformLocation(program_slvr, 'u_dot2');
	program_slvr.u_dot3		= gl.getUniformLocation(program_slvr, 'u_dot3');
	program_slvr.u_dot4		= gl.getUniformLocation(program_slvr, 'u_dot4');

	program_draw.u_vp		= gl.getUniformLocation(program_draw, 'u_vp');

	gl.useProgram(program_phys);
	gl.uniform2f(program_phys.u_viewport, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT);
	gl.useProgram(program_calc);
	gl.uniform2f(program_calc.u_viewport, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT);
	gl.useProgram(program_slvr);
	gl.uniform2f(program_slvr.u_viewport, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT);

	// Attributes
	program_phys.a_rectangle = gl.getAttribLocation(program_phys, 'a_rectangle');
	program_calc.a_rectancle = gl.getAttribLocation(program_calc, 'a_rectangle');
	program_slvr.a_rectancle = gl.getAttribLocation(program_slvr, 'a_rectangle');
	program_draw.a_reference = gl.getAttribLocation(program_draw, 'a_reference');

	var initial_state = new Float32Array(4 * NUM_PARTICLES * NUM_SLOTS);

	for (var i = 0; i < NUM_PARTICLES; i++) {
		initial_state[i * 8 + 0] = (Math.random() - 0.5) * 1.0;
		initial_state[i * 8 + 1] = (Math.random() - 0.5) * 1.0;
		initial_state[i * 8 + 2] = (Math.random() - 0.5) * 1.0;
		initial_state[i * 8 + 4] = (Math.random() - 0.5);
		initial_state[i * 8 + 5] = (Math.random() - 0.5);
		initial_state[i * 8 + 6] = (Math.random() - 0.5);
	}

	// Camera
	var view = mat4.create();

	var projection = mat4.create();
	mat4.perspective(projection, Math.PI / 3, gl.drawingBufferWidth/gl.drawingBufferHeight, 0.1, 100.0);

	var rotate = quat.create();
	var altitude = quat.create();
	var direction = quat.create();

	var front = vec3.create();

	var position = vec3.create();
	vec3.set(position, -2.0, -2.0, -2.0);

	var vp = mat4.create();

	dirpad = [false, false, false, false];
	wasd = [false, false, false, false];

	window.onkeydown = function(e) {
		var key = e.keyCode ? e.keyCode : e.which;
		if (key === 37)
			dirpad[0] = true;
		if (key === 38)
			dirpad[1] = true;
		if (key === 39)
			dirpad[2] = true;
		if (key === 40)
			dirpad[3] = true;
		if (key === 65)
			wasd[0] = true;
		if (key === 87)
			wasd[1] = true;
		if (key === 68)
			wasd[2] = true;
		if (key === 83)
			wasd[3] = true;
	}

	window.onkeyup = function(e) {
		var key = e.keyCode ? e.keyCode : e.which;
		if (key === 37)
			dirpad[0] = false;
		if (key === 38)
			dirpad[1] = false;
		if (key === 39)
			dirpad[2] = false;
		if (key === 40)
			dirpad[3] = false;
		if (key === 65)
			wasd[0] = false;
		if (key === 87)
			wasd[1] = false;
		if (key === 68)
			wasd[2] = false;
		if (key === 83)
			wasd[3] = false;
	}

	// Static Stuff

	// Textures
	var texture_state = gl.createTexture();
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture_state);

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT, 0, gl.RGBA, gl.FLOAT, initial_state);

	gl.useProgram(program_draw);
	gl.uniform1i(program_draw.u_state, 0);
	gl.useProgram(program_calc);
	gl.uniform1i(program_calc.u_state, 0);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	var texture_dot1 = gl.createTexture();
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, texture_dot1);

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT, 0, gl.RGBA, gl.FLOAT, initial_state);

	gl.useProgram(program_phys);
	gl.uniform1i(program_phys.u_dot, 1);
	gl.useProgram(program_calc);
	gl.uniform1i(program_calc.u_dot, 1);
	gl.useProgram(program_slvr);
	gl.uniform1i(program_slvr.u_dot1, 1);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	var texture_dot2 = gl.createTexture();
	gl.activeTexture(gl.TEXTURE2);
	gl.bindTexture(gl.TEXTURE_2D, texture_dot2);

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT, 0, gl.RGBA, gl.FLOAT, initial_state);

	gl.useProgram(program_slvr);
	gl.uniform1i(program_slvr.u_dot2, 2);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	var texture_dot3 = gl.createTexture();
	gl.activeTexture(gl.TEXTURE3);
	gl.bindTexture(gl.TEXTURE_2D, texture_dot3);

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT, 0, gl.RGBA, gl.FLOAT, initial_state);

	gl.useProgram(program_slvr);
	gl.uniform1i(program_slvr.u_dot3, 3);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	var texture_dot4 = gl.createTexture();
	gl.activeTexture(gl.TEXTURE4);
	gl.bindTexture(gl.TEXTURE_2D, texture_dot4);

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT, 0, gl.RGBA, gl.FLOAT, initial_state);

	gl.useProgram(program_slvr);
	gl.uniform1i(program_slvr.u_dot4, 4);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	// Framebuffers
	var fb_state = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb_state);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture_state, 0);

	var fb_dot1 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb_dot1);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture_dot1, 0);

	var fb_dot2 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb_dot2);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture_dot2, 0);

	var fb_dot3 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb_dot3);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture_dot3, 0);

	var fb_dot4 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb_dot4);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture_dot4, 0);

	var reference	= new Float32Array(NUM_PARTICLES * 2);
	var interval	= 1.0 / PARTICLES_PER_ROW;

	for (var i = 0; i < NUM_PARTICLES; i++) {
		reference[i * 2]		= interval * ~~(i % PARTICLES_PER_ROW);
		reference[i * 2 + 1]	= interval * ~~(i / PARTICLES_PER_ROW);
	}

	var buffer_reference = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer_reference);
	gl.bufferData(gl.ARRAY_BUFFER, reference, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(program_draw.a_reference);

	// Make a rectangle that draws over the whole buffer
	var buffer_rectangle = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer_rectangle);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		-1.0, -1.0,
		 1.0, -1.0,
		-1.0,  1.0,
		 1.0,  1.0,
	]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(program_phys.a_rectangle);
	gl.enableVertexAttribArray(program_calc.a_rectangle);
	gl.enableVertexAttribArray(program_slvr.a_rectangle);

	gl.useProgram(program_draw);
	gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

	var solve = function(source_dot_id, target_dot, dt) {
		gl.uniform1i(program_phys.u_dot, source_dot_id);
		gl.uniform1f(program_phys.u_dt, dt);

		// PHYSICS
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer_rectangle);
		gl.vertexAttribPointer(program_phys.a_rectangle, 2, gl.FLOAT, gl.FALSE, 0, 0);

		gl.bindFramebuffer(gl.FRAMEBUFFER, target_dot);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	var mode = 1;

	var last = Date.now();

	var frame = function() {
		var now	= Date.now();
		var dt	= (now - last) / 1000.0;
		last 	= now;

		stats.begin();

		gl.viewport(0, 0, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT);

		gl.useProgram(program_phys);

		if (mode === 0) {
			//EULER
			solve(1, fb_dot1, 0.0);
		} else {
			//RUNGE KUTTA
			solve(0, fb_dot1, 0.0);
			solve(1, fb_dot2, dt / 2.0);
			solve(2, fb_dot3, dt / 2.0);
			solve(3, fb_dot4, dt);

			gl.useProgram(program_slvr);

			gl.bindBuffer(gl.ARRAY_BUFFER, buffer_rectangle);
			gl.vertexAttribPointer(program_slvr.a_rectangle, 2, gl.FLOAT, gl.FALSE, 0, 0);

			gl.bindFramebuffer(gl.FRAMEBUFFER, fb_dot1);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}

		// CALCULATION
		gl.useProgram(program_calc);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer_rectangle);
		gl.vertexAttribPointer(program_calc.a_rectangle, 2, gl.FLOAT, gl.FALSE, 0, 0);

		gl.uniform1f(program_calc.u_dt, dt);

		gl.bindFramebuffer(gl.FRAMEBUFFER, fb_state);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		// DRAWING
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

		quat.rotateZ(rotate, rotate, dt * ((dirpad[0] ? 1 : 0) + (dirpad[2] ? -1 : 0)));
		quat.rotateX(altitude, altitude, dt * ((dirpad[1] ? -1 : 0) + (dirpad[3] ? 1 : 0)));
		quat.multiply(direction, altitude, rotate);

		vec3.set(front, 0.0, 1.0, 0.0);
		vec3.transformQuat(front, front, direction);
		vec3.scale(front, front, dt * ((wasd[1] ? 1 : 0) + (wasd[3] ? -1 : 0)));
		vec3.add(position, position, front)

		mat4.fromQuat(view, direction);
		mat4.translate(view, view, position);

		mat4.multiply(vp, projection, view);

		gl.useProgram(program_draw);
		gl.uniformMatrix4fv(program_draw.u_vp, false, vp);

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer_reference);
		gl.vertexAttribPointer(program_draw.a_reference, 2, gl.FLOAT, gl.FALSE, 0, 0);

		gl.drawArrays(gl.POINTS, 0, NUM_PARTICLES);

		gl.useProgram(program_stat);
		gl.uniformMatrix4fv(program_stat.u_vp, false, vp);

		gl.drawArrays(gl.LINES, 0, 6);

		stats.end();
		window.requestAnimationFrame(frame);
	};

	window.requestAnimationFrame(frame);
}