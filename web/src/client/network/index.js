/*
 * Copyright (c) [2023] SUSE LLC
 *
 * All Rights Reserved.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of version 2 of the GNU General Public License as published
 * by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, contact SUSE LLC.
 *
 * To contact SUSE LLC about this file by physical or electronic mail, you may
 * find current contact information at www.suse.com.
 */

// @ts-check

import DBusClient from "../dbus";
import { NetworkManagerAdapter, securityFromFlags } from "./network_manager";
import cockpit from "../../lib/cockpit";
import { createConnection, ConnectionTypes, ConnectionState, createAccessPoint, createDevice } from "./model";
import { formatIp, ipPrefixFor } from "./utils";

const SERVICE_NAME = "org.opensuse.Agama1";
const CONNECTIONS_IFACE = "org.opensuse.Agama1.Network.Connections";
const CONNECTIONS_PATH = "/org/opensuse/Agama1/Network/connections";
const CONNECTION_IFACE = "org.opensuse.Agama1.Network.Connection";
const CONNECTIONS_NAMESPACE = "/org/opensuse/Agama1/Network/connections";
const IP_IFACE = "org.opensuse.Agama1.Network.Connection.IP";
const WIRELESS_IFACE = "org.opensuse.Agama1.Network.Connection.Wireless";

const DeviceType = Object.freeze({
  LOOPBACK: 0,
  ETHERNET: 1,
  WIRELESS: 2,
  DUMMY: 3,
  BOND: 4
});

/**
 * @typedef {import("./model").NetworkSettings} NetworkSettings
 * @typedef {import("./model").Connection} Connection
 * @typedef {import("./model").Connection} Device
 * @typedef {import("./model").Connection} Route
 * @typedef {import("./model").IPAddress} IPAddress
 * @typedef {import("./model").AccessPoint} AccessPoint
 */

const NetworkEventTypes = Object.freeze({
  ACTIVE_CONNECTION_ADDED: "active_connection_added",
  ACTIVE_CONNECTION_UPDATED: "active_connection_updated",
  ACTIVE_CONNECTION_REMOVED: "active_connection_removed",
  CONNECTION_ADDED: "connection_added",
  CONNECTION_UPDATED: "connection_updated",
  CONNECTION_REMOVED: "connection_removed",
  SETTINGS_UPDATED: "settings_updated"
});

/**
 * @typedef {object} NetworkAdapter
 * @property {() => AccessPoint[]} accessPoints
 * @property {() => Promise<Connection[]>} connections
 * @property {(handler: (event: NetworkEvent) => void) => void} subscribe
 * @property {(id: string) => Promise<Connection>} getConnection
 * @property {(ssid: string, options: object) => boolean} addAndConnectTo
 * @property {(connection: Connection) => boolean} connectTo
 * @property {(connection: Connection) => Promise<any>} addConnection
 * @property {(connection: Connection) => Promise<any>} updateConnection
 * @property {(connection: Connection) => void} deleteConnection
 * @property {() => NetworkSettings} settings
 * @property {() => void} setUp
 */

/**
 * Network event
 *
 * @typedef {object} NetworkEvent
 * @property {string} type
 * @property {object} payload
 */

/**
 * Network event handler
 *
 * @typedef {(event: NetworkEvent) => void} NetworkEventFn
 */

/**
 * Network client
 */
class NetworkClient {
  /**
   * @param {import("../http").HTTPClient} client - HTTP client.
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * Returns the devices running configuration
   *
   * @return {Promise<Device[]>}
   */
  async devices() {
    const response = await this.client.get("/network/devices");
    if (!response.ok) {
      return [];
    }

    const devices = await response.json();
    return devices.map(this.fromApiDevice);
  }

  /**
   * Returns the device settings
   *
   * @param {object} device - device settings from the API server
   * @return {Device}
   */
  fromApiDevice(device) {
    const nameservers = (device?.ipConfig?.nameservers || []);
    const { ipConfig = {}, ...dev } = device;
    const routes4 = (ipConfig.routes4 || []).map((route) => {
      const [ip, netmask] = route.destination.split("/");
      const destination = { address: ip, prefix: ipPrefixFor(netmask) };

      return { ...route, destination };
    });

    const routes6 = (ipConfig.routes6 || []).map((route) => {
      const [ip, netmask] = route.destination.split("/");
      const destination = (netmask !== undefined) ? { address: ip, prefix: ipPrefixFor(netmask) } : { address: ip };

      return { ...route, destination };
    });

    const addresses = (ipConfig.addresses || []).map((address) => {
      const [ip, netmask] = address.split("/");
      if (netmask !== undefined) {
        return { address: ip, prefix: ipPrefixFor(netmask) };
      } else {
        return { address: ip };
      }
    });

    return { ...dev, ...ipConfig, addresses, nameservers, routes4, routes6 };
  }

  /**
   * Returns the connection settings
   *
   * @return {Promise<Connection[]>}
   */
  async connections() {
    const response = await this.client.get("/network/connections");
    if (!response.ok) {
      console.error("Failed to get list of connections", response);
      return [];
    }

    const connections = await response.json();
    return connections.map(this.fromApiConnection);
  }

  fromApiConnection(connection) {
    const nameservers = (connection.nameservers || []);
    const addresses = (connection.addresses || []).map((address) => {
      const [ip, netmask] = address.split("/");
      if (netmask !== undefined) {
        return { address: ip, prefix: ipPrefixFor(netmask) };
      } else {
        return { address: ip };
      }
    });

    return { ...connection, addresses, nameservers };
  }

  connectionType(connection) {
    if (connection.wireless) return ConnectionTypes.WIFI;
    if (connection.bond) return ConnectionTypes.BOND;
    if (connection.vlan) return ConnectionTypes.VLAN;
    if (connection.iface === "lo") return ConnectionTypes.LOOPBACK;

    return ConnectionTypes.ETHERNET;
  }

  toApiConnection(connection) {
    const addresses = (connection.addresses || []).map((addr) => formatIp(addr));
    const { iface, gateway4, gateway6, ...conn } = connection;

    if (gateway4?.trim() !== "") conn.gateway4 = gateway4;
    if (gateway6?.trim() !== "") conn.gateway6 = gateway6;

    return { ...conn, addresses, interface: iface };
  }

  /**
   * Returns the list of available wireless access points (AP)
   *
   * @return {Promise<AccessPoint[]>}
   */
  async accessPoints() {
    const response = await this.client.get("/network/wifi");
    if (!response.ok) {
      console.error("Failed to get list of APs", response);
      return [];
    }
    const access_points = await response.json();

    return access_points.map((ap) => {
      return createAccessPoint({
        ssid: ap.ssid,
        hwAddress: ap.hw_address,
        strength: ap.strength,
        security: securityFromFlags(ap.flags, ap.wpa_flags, ap.rsn_flags)
      });
    });
  }

  /**
   * Connects to given Wireless network
   *
   * @param {Connection} connection - connection to be activated
   */
  async connectTo(connection) {
    const conn = await this.addConnection(connection);
    await this.apply();

    return conn;
  }

  /**
   * Apply network changes
   */
  async apply() {
    return this.client.put("/network/system/apply", {});
  }

  /**
   * Add the connection for the given Wireless network and activate it
   *
   * @param {string} ssid - Network id
   * @param {object} options - connection options
   */
  async addAndConnectTo(ssid, options) {
    // duplicated code (see network manager adapter)
    const wireless = { ssid, mode: "infrastructure" };
    if (options.security) wireless.security = options.security;
    if (options.password) wireless.password = options.password;
    if (options.hidden) wireless.hidden = options.hidden;
    if (options.mode) wireless.mode = options.mode;

    const connection = createConnection({
      id: ssid,
      wireless,
    });

    // the connection is automatically activated when written
    return this.connectTo(connection);
  }

  /**
   * Adds a new connection
   *
   * If a connection with the given ID already exists, it updates such a
   * connection.
   *
   * @param {Connection} connection - Connection to add
   * @return {Promise<Connection>} the added connection
   */
  async addConnection(connection) {
    const response = await this.client.post("/network/connections", this.toApiConnection(connection));
    if (!response.ok) {
      console.error("Failed to post list of connections", response);
      return null;
    }

    return response.json();
  }

  /**
   * Returns the connection with the given ID
   *
   * @param {string} id - Connection ID
   * @return {Promise<Connection|undefined>}
   */
  async getConnection(id) {
    const connections = await this.connections();

    return connections.find((conn) => conn.id === id);
  }

  /**
   * Updates the connection
   *
   * It uses the 'id' to match the connection in the backend.
   *
   * @param {Connection} connection - Connection to update
   * @return {Promise<boolean>} - the promise resolves to true if the connection
   *   was successfully updated and to false it it does not exist.
   */
  async updateConnection(connection) {
    const conn = this.toApiConnection(connection);
    await this.client.put(`/network/connections/${conn.id}`, conn);
    return (await this.apply()).ok;
  }

  /**
   * Deletes the connection
   *
   * It uses the 'path' to match the connection in the backend.
   *
   * @param {String} id - Connection id
   * @return {Promise<boolean>} - the promise resolves to true if the connection
   *  was successfully deleted.
   */
  async deleteConnection(id) {
    await this.client.delete(`/network/connections/${id}`);
    return (await this.apply()).ok;
  }

  /*
   * Returns list of IP addresses for all active NM connections
   *
   * @todo remove duplicates
   * @private
   * @return {Promise<IPAddress[]>}
   */
  async addresses() {
    const conns = await this.connections();
    return conns.flatMap(c => c.addresses);
  }

  /*
  * Returns network general settings
  *
   * @return {Promise<NetworkSettings>}
  */
  async settings() {
    const response = await this.client.get("/network/settings");
    if (!response.ok) {
      console.error("Failed to get settings", response);
      return {};
    }
    return response.json();
  }
}

export {
  ConnectionState,
  ConnectionTypes,
  NetworkClient,
  NetworkEventTypes
};
