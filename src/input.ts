import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { quote } from "shell-quote";

import * as parser from "@solidity-parser/parser";
import {
  ContractDefinition,
  ElementaryTypeName,
  FunctionDefinition,
  Mapping,
  StructDefinition,
  UserDefinedTypeName,
  VariableDeclaration,
} from "@solidity-parser/parser/src/ast-types";

import {
  ParsedSource,
  StorageLayoutReport,
  StorageLayoutReportExact,
  StorageVariable,
  StorageVariableExact,
  StorageVariableType,
} from "./types";

const exactify = (variable: StorageVariable): StorageVariableExact => ({
  ...variable,
  slot: BigInt(variable.slot),
  offset: BigInt(variable.offset),
});

export const createLayout = (contract: string, cwd = ".") => {
  const [contractPath, contractName] = contract.split(":");

  const { children, tokens = [] } = parser.parse(fs.readFileSync(path.join(cwd, contractPath), { encoding: "utf-8" }), {
    tolerant: true,
    tokens: true,
    loc: true,
  });

  // check if contract is a diamond library, otherwise return default storage layout
  const def = children.find(
    (child) => child.type === "ContractDefinition" && child.name === contractName
  ) as ContractDefinition | undefined;

  if (def) {
    // find all functions in the contract
    const contractFunctions = def.subNodes.filter(
      (child) => child.type === "FunctionDefinition"
    ) as FunctionDefinition[];

    // find all structs in the contract
    const contractStructs = def.subNodes.filter(
      (child) => child.type === "StructDefinition"
    ) as StructDefinition[];

    // has diamond storage if there is a function that returns a pointer to storage struct
    const hasDiamondStorage = contractFunctions.find(
      (f) => f.returnParameters && f.returnParameters[0].storageLocation === "storage"
    );

    if (hasDiamondStorage && hasDiamondStorage.returnParameters) {
      const diamondStruct: VariableDeclaration = hasDiamondStorage.returnParameters[0];

      if (diamondStruct.typeName) {
        const v: UserDefinedTypeName = <UserDefinedTypeName>diamondStruct.typeName;
        const diamondStorageStructName : String = v.namePath;

        // find the diamond storage struct
        const diamondStorageStruct : StructDefinition | undefined = contractStructs.find(
          (s) => s.name === diamondStorageStructName
        );

        // create storage layout from AST and return
        let diamondStorageLayout : StorageLayoutReport = {storage: [], types: {}};

        if (diamondStorageStruct) {
          let slot = 0;
          diamondStorageStruct.members.forEach(function(v)
          {
            const member : StorageVariable = {
              astId : 0,
              contract: contract,
              label: v.name || "",
              offset: 0,
              slot: String(slot),
              type: (<ElementaryTypeName>(v.typeName)).name || (<UserDefinedTypeName>(v.typeName)).namePath || (<Mapping>(v.typeName)).type
            };
            diamondStorageLayout.storage.push(member);
            const memberType: StorageVariableType = {
              encoding: "inplace",
              label: member.type,
              numberOfBytes: "1"
            };
            diamondStorageLayout.types[member.type] = memberType;
            slot++;
          });

          return JSON.stringify(diamondStorageLayout);
        }
      }
    }
  };

  const sl : string = execSync(quote(["forge", "inspect", contract, "storage-layout"]), {
      encoding: "utf-8",
      cwd,
  });

  return sl;
};

export const parseLayout = (content: string): StorageLayoutReportExact => {
  try {
    const layout: StorageLayoutReport = JSON.parse(content);

    return {
      storage: layout.storage.map(exactify),
      types: Object.fromEntries(
        Object.entries(layout.types).map(([name, type]) => [
          name,
          {
            ...type,
            members: type.members?.map(exactify),
            numberOfBytes: BigInt(type.numberOfBytes),
          },
        ])
      ),
    };
  } catch (error: any) {
    console.error("Error while parsing storage layout:", content);

    throw error;
  }
};

export const parseSource = (contract: string): ParsedSource => {
  const [path, contractName] = contract.split(":");

  const { children, tokens = [] } = parser.parse(fs.readFileSync(path, { encoding: "utf-8" }), {
    tolerant: true,
    tokens: true,
    loc: true,
  });

  const def = children.find(
    (child) => child.type === "ContractDefinition" && child.name === contractName
  ) as ContractDefinition | undefined;
  if (!def) throw Error(`Contract definition not found: ${contractName}`);

  return { path, def, tokens };
};
